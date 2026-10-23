# 시뮬레이션 데이터

시연 영상용으로 2024년 원본 CSV에서 2026년 하루치(1초, 86,400행) 관측값을 만들어 서버에 등록하기 위한 노트북 모음.
만든 CSV는 `data/sim/` 아래에 두며 Git에 올리지 않음. 화면과 영상에서는 **시뮬레이션 자료**라고 밝힘.

## 실행 순서

| 순서 | 노트북 | 하는 일 | 만드는 파일 |
| --- | --- | --- | --- |
| 1 | [01_make_2026_day](01_make_2026_day.ipynb) | 2024 LOT의 실제 구간을 2026-10-26 시간축에 붙이고 흔들림과 사건 3건을 심음 | `data/sim/cal01_sim_2026-10-26.csv`, `_events.csv`, `.png` |

- 입력은 옆 저장소 `pdm-project/data/processed/cal01_base_v1.csv`임 (2024년 1초 원기록, 제외 표시 포함)
- 날짜, LOT 일정, 심는 사건은 노트북 1번 셀에서 바꿈. `RANDOM_STATE = 42` 고정
- pandas, numpy, matplotlib이 있는 Python 환경에서 실행함 (pdm-project의 `.venv`를 써도 됨)

## 서버에 등록

```powershell
.venv/Scripts/python.exe backend/manage.py import_cal01 data/sim/cal01_sim_2026-10-26.csv --name "2026-10-26 시뮬레이션"
```

- 같은 파일을 다시 등록하면 "이미 등록된 데이터"로 건너뜀. 내용을 바꾸면 새 데이터로 등록됨
- `LABEL = 1`은 노트북이 심은 사건 행임. 서버 화면에서는 원자료 LABEL과 같은 자리에 표시됨

## 만드는 방법 요약

- 하루 = LOT 4개 (SPHC, SPCE, SPFH590, SPHC). 각 LOT은 같은 강종의 2024 LOT에서 제외 구간 없이 이어진 행을 통째로 옮김. 공통 움직임과 TC, OP 관계가 그대로 보존됨
- 채널마다 표준편차의 10% 크기 잡음을 더해 원본과 똑같은 행이 없게 함
- 사건 3건: E1 CP-Z4 급등 후 복귀 (T01 모양 이식), E2 CP-Z4 선행 하강 (T12 모양 이식), E3 가열 능력 저하 (합성: OP-Z4 상승에도 TC-Z4 하강)
- VAE 같은 생성 모델은 LOT 14개로는 채널 사이 관계를 배우고 검증하기 어려워 쓰지 않음
