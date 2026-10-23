import hashlib
import json

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.core.cache import cache
from django.db import DatabaseError, InterfaceError, connection
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST


def user_details(user):
    groups = set(user.groups.values_list("name", flat=True))
    return {
        "username": user.username,
        "display_name": user.first_name or user.username,
        "team": "monitoring" if "monitoring" in groups else ("field" if "field" in groups else None),
        "is_admin": user.is_staff or user.is_superuser,
        "can_edit_layout": user.is_staff or user.has_perm("monitor.change_equipmentlayout"),
    }


@require_GET
@ensure_csrf_cookie
def csrf(request):
    return JsonResponse({"csrfToken": get_token(request)})


@require_GET
def health(request):
    return JsonResponse({"service": "cal01-monitor", "version": "0.1.0"})


@require_GET
def ready(request):
    available = False
    try:
        if (settings.CAL01_FRONTEND_ROOT / "index.html").is_file():
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                available = cursor.fetchone() == (1,)
    except (DatabaseError, InterfaceError, OSError):
        pass
    response = JsonResponse({"service": "cal01-monitor", "ready": available}, status=200 if available else 503)
    response["Cache-Control"] = "no-store"
    return response


def failure_keys(request, username):
    keys = ["login-user-" + hashlib.sha256(username.lower().encode()).hexdigest()]
    if settings.LOGIN_LIMIT_REMOTE_ADDRESS:
        address = request.META.get("REMOTE_ADDR", "unknown")
        keys.append("login-address-" + hashlib.sha256(address.encode()).hexdigest())
    return keys


@require_POST
@csrf_protect
def login_view(request):
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"detail": "로그인 요청을 읽을 수 없습니다."}, status=400)
    if not isinstance(data, dict):
        return JsonResponse({"detail": "로그인 정보를 확인해 주세요."}, status=400)
    username, password = data.get("username"), data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return JsonResponse({"detail": "아이디와 비밀번호를 입력해 주세요."}, status=400)
    if not username or len(username) > 150 or len(password) > 1024:
        return JsonResponse({"detail": "아이디 또는 비밀번호를 확인해 주세요."}, status=400)
    keys = failure_keys(request, username)
    if any(cache.get(key, 0) >= settings.LOGIN_FAILURE_LIMIT for key in keys):
        return JsonResponse({"detail": "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요."}, status=429)
    user = authenticate(request, username=username, password=password)
    if user is None:
        for key in keys:
            if not cache.add(key, 1, settings.LOGIN_FAILURE_WINDOW):
                try:
                    cache.incr(key)
                except ValueError:
                    cache.set(key, 1, settings.LOGIN_FAILURE_WINDOW)
        return JsonResponse({"detail": "아이디 또는 비밀번호를 확인해 주세요."}, status=401)
    cache.delete(keys[0])
    login(request, user)
    return JsonResponse({"user": user_details(user), "csrfToken": get_token(request)})


@require_POST
@csrf_protect
def logout_view(request):
    logout(request)
    return JsonResponse({"ok": True})


@require_GET
def me(request):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "로그인이 필요합니다."}, status=401)
    return JsonResponse({"user": user_details(request.user)})
