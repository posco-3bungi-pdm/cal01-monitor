"""Private operational evidence for team accounts; never part of public frontend assets."""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .workflow_views import require_team


PART_EVIDENCE = {
    "INS-006": {
        "evidence": "cal01-replacement",
        "note": "CAL01 교체 기록 3건. 실제 채취 위치와 CP-Z4·CP-Z4M 연결은 자료에 없음.",
        "workOrderIds": [
            "WO-2024-00776",
            "WO-2024-01178",
            "WO-2024-02105"
        ]
    },
    "SEL-006": {
        "evidence": "cal01-replacement",
        "note": "CAL01 교체 기록 3건. 부품마스터 규격은 150×190×18. 화면의 축 위치와 크기는 설명용임.",
        "workOrderIds": [
            "WO-2024-00508",
            "WO-2024-00916",
            "WO-2024-01346"
        ]
    },
    "SEL-009": {
        "evidence": "cal01-replacement",
        "note": "CAL01 교체 기록 3건. 어느 연결부에 쓰였는지는 자료에 없어 대표적인 플랜지 모형으로 표현함.",
        "workOrderIds": [
            "WO-2024-00597",
            "WO-2024-00916",
            "WO-2024-01094"
        ]
    },
    "HTR-006": {
        "evidence": "master-only",
        "note": "부품마스터에만 있음. CAL01 교체 기록과 특정 TC 채널의 열전대 종류는 확인되지 않음.",
        "workOrderIds": []
    },
    "HTR-008": {
        "evidence": "master-only",
        "note": "부품마스터에만 있음. CAL01 교체 기록·채널 연결·설치 위치는 확인되지 않음.",
        "workOrderIds": []
    }
}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def part_evidence(request):
    require_team(request.user)
    response = Response({"parts": PART_EVIDENCE})
    response["Cache-Control"] = "no-store, private"
    return response
