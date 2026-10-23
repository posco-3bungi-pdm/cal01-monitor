from django.urls import path

from . import auth_views, context_views, data_views, detection_views, views, workflow_views

urlpatterns = [
    path("health", auth_views.health),
    path("ready", auth_views.ready),
    path("csrf", auth_views.csrf),
    path("login", auth_views.login_view),
    path("logout", auth_views.logout_view),
    path("me", auth_views.me),
    path("datasets", views.datasets),
    path("datasets/import", data_views.import_dataset),
    path("lots", views.lots),
    path("material-grades", views.material_grades),
    path("lot-grade-link", views.lot_grade_link),
    path("channels", views.channels),
    path("series", views.series),
    path("current-frame", views.current_frame),
    path("playback-frames", data_views.playback_frames),
    path("records", context_views.records),
    path("equipment/layout", views.equipment_layout),
    path("detection/runs", detection_views.runs),
    path("detection/candidates", detection_views.candidates),
    path("detection/pending", detection_views.pending_candidates),
    path("detection/candidates/<uuid:candidate_id>/acknowledge", detection_views.acknowledge),
    path("detection/candidates/<uuid:candidate_id>/resolve", detection_views.resolve),
    path("field-requests", workflow_views.field_requests),
    path("field-requests/<uuid:request_id>", workflow_views.field_request_detail),
    path("field-requests/<uuid:request_id>/transition", workflow_views.transition),
    path("field-users", workflow_views.field_users),
    path("notifications", workflow_views.notifications),
]
