from django.contrib import admin

from .models import Dataset, EquipmentLayout, EquipmentLayoutHistory, LotSummary


@admin.register(Dataset)
class DatasetAdmin(admin.ModelAdmin):
    list_display = ["name", "status", "row_count", "created_at"]
    readonly_fields = ["id", "sha256", "source_name", "source_size", "row_count", "created_at", "metadata"]


@admin.register(EquipmentLayoutHistory)
class LayoutHistoryAdmin(admin.ModelAdmin):
    list_display = ["layout", "revision", "changed_by", "created_at"]
    readonly_fields = ["layout", "revision", "placements", "changed_by", "created_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(LotSummary)
