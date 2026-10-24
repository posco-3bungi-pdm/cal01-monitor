"""Session-bound presentation tickets; no team password is exposed."""
import hashlib
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import Group
from django.core import signing
from django.core.cache import cache
from django.db import transaction
from django.utils.crypto import constant_time_compare
from rest_framework.exceptions import PermissionDenied

USERNAME = "cal01-guest"
GROUP = "presentation_viewer"
TICKET_MAX_AGE = 10 * 60
TICKET_SALT = "cal01.presentation-entry.v1"
NONCE_KEY = "cal01_presentation_nonce"


class PresentationAccountConflict(Exception):
    pass


def is_presentation_viewer(user):
    return bool(user.is_authenticated and (
        user.username.casefold() == USERNAME or user.groups.filter(name=GROUP).exists()
    ))


def valid_presentation_user(user):
    return bool(
        user.is_authenticated and user.username == USERNAME and user.is_active
        and not user.is_staff and not user.is_superuser and not user.has_usable_password()
        and set(user.groups.values_list("name", flat=True)) == {GROUP}
        and not user.user_permissions.exists()
        and not user.groups.filter(permissions__isnull=False).exists()
    )


def presentation_dataset_ids():
    return tuple(settings.CAL01_PRESENTATION_DATASET_IDS)


def presentation_enabled():
    # A public entry without an explicit dataset scope must never open access.
    return bool(settings.CAL01_PRESENTATION_ENABLED and presentation_dataset_ids())


def scope_datasets(user, queryset):
    return queryset.filter(pk__in=presentation_dataset_ids()) if is_presentation_viewer(user) else queryset


def require_presentation_dataset(user, dataset_id):
    if is_presentation_viewer(user) and str(dataset_id) not in presentation_dataset_ids():
        raise PermissionDenied("발표에 공개된 시뮬레이션 데이터만 볼 수 있습니다.")


def _session_key(request):
    if not request.session.session_key:
        request.session.create()
    return request.session.session_key


def _binding(request):
    return hashlib.sha256(_session_key(request).encode()).hexdigest()


def issue_ticket(request):
    nonce = request.session.get(NONCE_KEY)
    if not isinstance(nonce, str) or not nonce:
        nonce = secrets.token_urlsafe(32)
        request.session[NONCE_KEY] = nonce
    ticket = signing.dumps({"nonce": nonce, "session": _binding(request)}, salt=TICKET_SALT)
    return {"username": USERNAME, "password": ticket, "expires_in": TICKET_MAX_AGE}


def _failure_key(request):
    return "presentation-login-session-" + _binding(request)


def _record_failure(key):
    if not cache.add(key, 1, settings.LOGIN_FAILURE_WINDOW):
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, settings.LOGIN_FAILURE_WINDOW)


def _viewer_account():
    with transaction.atomic():
        group, _ = Group.objects.get_or_create(name=GROUP)
        if group.permissions.exists():
            raise PresentationAccountConflict
        User = get_user_model()
        existing = User.objects.filter(username__iexact=USERNAME).first()
        if existing is not None and existing.username != USERNAME:
            raise PresentationAccountConflict
        user, created = User.objects.get_or_create(username=USERNAME, defaults={
            "password": make_password(None), "first_name": "발표 관람",
        })
        if created:
            user.groups.add(group)
        if not valid_presentation_user(user):
            raise PresentationAccountConflict
        return user


def enter_presentation(request, ticket):
    """Return status/payload. Only this browser session accumulates failures."""
    if not presentation_enabled():
        return 403, {"detail": "발표 입장이 꺼져 있습니다."}
    key = _failure_key(request)
    if cache.get(key, 0) >= settings.LOGIN_FAILURE_LIMIT:
        return 429, {"detail": "이 브라우저의 입장 시도가 많습니다. 잠시 후 다시 시도해 주세요."}
    try:
        payload = signing.loads(ticket, salt=TICKET_SALT, max_age=TICKET_MAX_AGE)
        nonce = request.session.get(NONCE_KEY)
        valid = (isinstance(payload, dict) and isinstance(nonce, str) and bool(nonce)
                 and isinstance(payload.get("nonce"), str) and isinstance(payload.get("session"), str)
                 and constant_time_compare(payload["nonce"], nonce)
                 and constant_time_compare(payload["session"], _binding(request)))
    except (signing.BadSignature, ValueError, TypeError):
        valid = False
    if not valid:
        _record_failure(key)
        return 401, {"detail": "입장 정보가 만료되었거나 이 브라우저에서 발급되지 않았습니다. 다시 불러와 주세요."}
    try:
        user = _viewer_account()
    except PresentationAccountConflict:
        return 409, {"detail": "관람 계정 설정이 충돌합니다. 운영자에게 확인해 주세요."}
    cache.delete(key)
    request.session.pop(NONCE_KEY, None)
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return 200, user
