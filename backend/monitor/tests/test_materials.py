from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from monitor.materials import MATERIAL_GRADES
from monitor.models import Dataset, LotSummary, MeasurementFrame
from monitor.tests.test_workflow import client_for, team_user


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class MaterialLinkTests(TestCase):
    def setUp(self):
        self.client = client_for(team_user("material-operator", "monitoring"))
        self.dataset = Dataset.objects.create(name="Material example", sha256="e" * 64, source_name="example.csv", status="ready", metadata={"source_columns": ["LOT_NO"]})
        self.lot = LotSummary.objects.create(dataset=self.dataset, lot_no="EXAMPLE01", grade="", start="2024-01-01T00:00:00", end="2024-01-01T00:01:00", count=1)
        self.frame = MeasurementFrame.objects.create(dataset=self.dataset, lot_no=self.lot.lot_no, grade="", source_row=1, source_record_id="example-1", recorded_at=self.lot.start, recorded_at_raw=self.lot.start, values={"CP-Z4M": 1e-10})
        self.query = {"dataset": str(self.dataset.id), "lot": self.lot.lot_no}
        self.url = f"/api/lot-grade-link?dataset={self.dataset.id}&lot={self.lot.lot_no}"

    def test_missing_grade_does_not_guess_product_from_lot(self):
        item = self.client.get("/api/lots", self.query).data["lots"][0]
        self.assertEqual(item["grade"], "")
        self.assertIsNone(item["product"])
        self.assertIsNone(item["grade_source"])

    def test_source_grade_automatically_uses_reference_and_cannot_be_replaced(self):
        self.lot.grade = "SPCC"
        self.lot.save()
        item = self.client.get("/api/lots", self.query).data["lots"][0]
        self.assertEqual(item["product"]["family"], "냉연강판")
        self.assertEqual(item["product"]["color"], "#9AA7B5")
        self.assertEqual(item["grade_source"], "source")
        self.assertEqual(self.client.patch(self.url, {"grade": "SGCC", "revision": 0}, format="json").status_code, 400)

    def test_manual_link_is_separate_from_observations_and_reused_on_next_query(self):
        response = self.client.patch(self.url, {"grade": "DP590", "revision": 0}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["lot"]["product"]["color"], "#2B527A")
        item = self.client.get("/api/lots", self.query).data["lots"][0]
        self.assertEqual(item["grade"], "DP590")
        self.assertEqual(item["grade_source"], "linked")
        self.assertEqual(item["material_revision"], 1)
        self.frame.refresh_from_db(); self.lot.refresh_from_db(); self.dataset.refresh_from_db()
        self.assertEqual(self.frame.grade, "")
        self.assertEqual(self.frame.values, {"CP-Z4M": 1e-10})
        self.assertEqual(self.lot.grade, "")
        self.assertEqual(self.dataset.metadata["source_columns"], ["LOT_NO"])

    def test_stale_revision_cannot_replace_another_team_members_link(self):
        self.client.patch(self.url, {"grade": "SPCC", "revision": 0}, format="json")
        self.assertEqual(self.client.patch(self.url, {"grade": "SPCD", "revision": 0}, format="json").status_code, 409)
        self.assertEqual(self.client.get("/api/lots", self.query).data["lots"][0]["grade"], "SPCC")
        cleared = self.client.patch(self.url, {"grade": "", "revision": 1}, format="json")
        self.assertIsNone(cleared.data["lot"]["product"])
        self.assertEqual(cleared.data["lot"]["material_revision"], 2)

    def test_invalid_grade_and_lot_and_outside_team_cannot_write(self):
        for payload in [{"grade": "UNKNOWN", "revision": 0}, {"grade": "SPCC", "revision": True}, {"grade": "SPCC"}, []]:
            self.assertEqual(self.client.patch(self.url, payload, format="json").status_code, 400)
        self.assertEqual(self.client.patch(self.url.replace('EXAMPLE01', 'MISSING'), {"grade": "SPCC", "revision": 0}, format="json").status_code, 404)
        outsider = client_for(get_user_model().objects.create_user("material-outsider"))
        self.assertEqual(outsider.patch(self.url, {"grade": "SPCC", "revision": 0}, format="json").status_code, 403)
        self.dataset.refresh_from_db()
        self.assertNotIn("lot_grade_links", self.dataset.metadata)

    def test_catalog_preserves_the_eight_user_supplied_colors(self):
        expected = {"SPCC": "#9AA7B5", "SPCD": "#3E75A8", "SPCE": "#3F909A", "SPCEN": "#8676AC", "SPHC": "#A48258", "SPFH590": "#B4634E", "DP590": "#2B527A", "SGCC": "#B9D6D9"}
        items = self.client.get("/api/material-grades").data["grades"]
        self.assertEqual({item["grade"]: item["color"] for item in items}, expected)
        self.assertEqual(set(MATERIAL_GRADES), set(expected))
