from rest_framework.permissions import BasePermission, SAFE_METHODS

from .presentation import is_presentation_viewer, presentation_enabled, valid_presentation_user


class AuthenticatedPresentationAccess(BasePermission):
    """All future mutations default to denied for the shared viewer account."""
    message = "관람 계정은 조회와 시뮬레이션만 사용할 수 있습니다."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if not is_presentation_viewer(user):
            return True
        if not presentation_enabled() or not valid_presentation_user(user):
            return False
        if request.method in SAFE_METHODS:
            return True
        match = getattr(request, "resolver_match", None)
        # This POST only computes read-only inference; it persists no candidate or alert.
        return request.method == "POST" and match is not None and match.url_name == "model-predictions"
