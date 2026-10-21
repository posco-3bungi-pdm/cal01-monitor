from django.urls import path

from . import auth_views, context_views, views

urlpatterns = [
    path("health", auth_views.health),
    path("csrf", auth_views.csrf),
    path("login", auth_views.login_view),
    path("logout", auth_views.logout_view),
    path("me", auth_views.me),
    path("datasets", views.datasets),
    path("lots", views.lots),
    path("channels", views.channels),
    path("series", views.series),
    path("current-frame", views.current_frame),
    path("records", context_views.records),
    path("equipment/layout", views.equipment_layout),
]
