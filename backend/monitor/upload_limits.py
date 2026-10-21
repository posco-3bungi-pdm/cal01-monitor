"""Bound CSV uploads before multipart parsing writes them to temporary storage."""
from django.conf import settings
from django.core.files.uploadhandler import FileUploadHandler, StopUpload, TemporaryFileUploadHandler
from django.http import JsonResponse


class BoundedCsvUploadHandler(FileUploadHandler):
    def __init__(self, request):
        super().__init__(request)
        self.received = 0
        self.files = 0

    def reject(self, detail):
        self.request.cal01_upload_error = detail
        raise StopUpload(connection_reset=False)

    def new_file(self, *args, **kwargs):
        super().new_file(*args, **kwargs)
        self.files += 1
        if self.files > 1 or self.field_name != "file":
            self.reject("file 항목에 CSV 한 개만 보내 주세요.")

    def receive_data_chunk(self, raw_data, start):
        self.received += len(raw_data)
        if self.received > settings.CAL01_UPLOAD_MAX_BYTES:
            self.reject("CSV 파일이 허용된 크기를 넘었습니다.")
        return raw_data

    def file_complete(self, file_size):
        return None


class CsvUploadLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path != "/api/datasets/import" or request.method != "POST":
            return self.get_response(request)
        # AuthenticationMiddleware has run; anonymous uploads never reach parsing.
        if not request.user.is_authenticated or not request.user.is_active:
            return JsonResponse({"detail": "로그인이 필요합니다."}, status=401)
        try:
            length = int(request.META.get("CONTENT_LENGTH", "0"))
        except ValueError:
            return JsonResponse({"detail": "요청 크기가 올바르지 않습니다."}, status=400)
        if length < 0 or length > settings.CAL01_UPLOAD_MAX_BYTES + 1024 * 1024:
            return JsonResponse({"detail": "CSV 파일이 허용된 크기를 넘었습니다."}, status=413)
        request.upload_handlers = [
            BoundedCsvUploadHandler(request), TemporaryFileUploadHandler(request),
        ]
        response = self.get_response(request)
        if error := getattr(request, "cal01_upload_error", None):
            return JsonResponse({"detail": error}, status=413)
        return response
