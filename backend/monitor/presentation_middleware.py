from django.http import JsonResponse

from .presentation import is_presentation_viewer, presentation_enabled, valid_presentation_user


class PresentationReadOnlyMiddleware:
    """Reject viewer uploads before multipart parsing and block Django admin too."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if is_presentation_viewer(request.user):
            path = request.path_info
            admin = path == "/admin" or path.startswith("/admin/")
            api = path.startswith("/api/")
            auth = path in {"/api/login", "/api/logout", "/api/csrf", "/api/presentation-login"}
            unavailable = not presentation_enabled() or not valid_presentation_user(request.user)
            mutation = request.method not in {"GET", "HEAD", "OPTIONS"}
            inference = path == "/api/model-predictions" and request.method == "POST"
            if admin or (api and not auth and (unavailable or (mutation and not inference))):
                response = JsonResponse({"detail": "관람 계정은 조회와 시뮬레이션만 사용할 수 있습니다."}, status=403)
                response["Cache-Control"] = "no-store, private"
                return response
        return self.get_response(request)
