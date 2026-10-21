from django.contrib import admin
from django.urls import include, path
from monitor.frontend_view import frontend

urlpatterns = [
    path("", frontend),
    path("admin/", admin.site.urls),
    path("api/", include("monitor.urls")),
]
