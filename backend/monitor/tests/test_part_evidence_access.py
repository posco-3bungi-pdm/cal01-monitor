from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from monitor.presentation import GROUP, USERNAME


# Preserved from the original team-only catalog at main09ab26d.
EXPECTED = {
    "INS-006": {
        "evidence": "cal01-replacement",
        "note": "CAL01 교체 기록 3건. 실제 채취 위치와 CP-Z4·CP-Z4M 연결은 자료에 없음.",
        "workOrderIds": ["WO-2024-00776", "WO-2024-01178", "WO-2024-02105"],
    },
    "SEL-006": {
        "evidence": "cal01-replacement",
        "note": "CAL01 교체 기록 3건. 부품마스터 규격은 150×190×18. 화면의 축 위치와 크기는 설명용임.",
        "workOrderIds": ["WO-2024-00508", "WO-2024-00916", "WO-2024-01346"],
    },
    "SEL-009": {
        "evidence": "cal01-replacement",
        "note": "CAL01 교체 기록 3건. 어느 연결부에 쓰였는지는 자료에 없어 대표적인 플랜지 모형으로 표현함.",
        "workOrderIds": ["WO-2024-00597", "WO-2024-00916", "WO-2024-01094"],
    },
    "HTR-006": {
        "evidence": "master-only",
        "note": "부품마스터에만 있음. CAL01 교체 기록과 특정 TC 채널의 열전대 종류는 확인되지 않음.",
        "workOrderIds": [],
    },
    "HTR-008": {
        "evidence": "master-only",
        "note": "부품마스터에만 있음. CAL01 교체 기록·채널 연결·설치 위치는 확인되지 않음.",
        "workOrderIds": [],
    },
}


@override_settings(CAL01_PRESENTATION_ENABLED=True,
                   CAL01_PRESENTATION_DATASET_IDS=("11111111-1111-4111-8111-111111111111",))
class PartEvidenceAccessTests(TestCase):
    endpoint = "/api/equipment/part-evidence"

    def test_anonymous_cannot_read_internal_replacement_evidence(self):
        response = self.client.get(self.endpoint)
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("WO-2024", response.content.decode())

    def test_presentation_viewer_cannot_read_even_with_a_known_endpoint(self):
        user = get_user_model().objects.create_user(USERNAME)
        user.groups.add(Group.objects.get_or_create(name=GROUP)[0])
        self.client.force_login(user)
        response = self.client.get(self.endpoint)
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("WO-2024", response.content.decode())
        self.assertNotIn("150×190×18", response.content.decode())

    def test_authenticated_non_team_account_cannot_read_evidence(self):
        user = get_user_model().objects.create_user("not-a-team-member")
        self.client.force_login(user)
        self.assertEqual(self.client.get(self.endpoint).status_code, 403)

    def test_both_team_roles_preserve_all_five_original_part_records(self):
        for team in ["monitoring", "field"]:
            with self.subTest(team=team):
                user = get_user_model().objects.create_user(team + "-part-reader")
                user.groups.add(Group.objects.get_or_create(name=team)[0])
                client = APIClient()
                client.force_authenticate(user=user)
                response = client.get(self.endpoint)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {"parts": EXPECTED})
                self.assertEqual(client.post(self.endpoint, {}, format="json").status_code, 405)
