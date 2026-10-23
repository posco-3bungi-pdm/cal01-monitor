# 코일 강종과 제품 설명

강종이 기록된 LOT는 아래 제품 설명과 색상을 자동으로 연결한다. 제품군의 일반적인 설명이며 해당 코일의 성적서, 주문 규격, 현재 표면 처리 상태 또는 소둔 조건을 보증하는 표가 아니다. 색상은 사용자가 정한 식별용 색이며 이상 후보·경보 등급과 무관하다.

| 강종 | 식별 색상 | 제품군 | 짧은 특성 |
| --- | --- | --- | --- |
| SPCC | `#9AA7B5` | 냉연강판 | 일반 가공용 |
| SPCD | `#3E75A8` | 냉연강판 | 드로잉용 · 금형으로 눌러 용기 모양 성형 |
| SPCE | `#3F909A` | 냉연강판 | 딥드로잉용 · 더 깊은 모양 성형 |
| SPCEN | `#8676AC` | 냉연강판 | 비시효성 딥드로잉용 · 시간 경과에 따른 성형성 변화 관리 |
| SPHC | `#A48258` | 열연계 강판 | 일반 가공용 · 산세·급유 여부는 별도 확인 |
| SPFH590 | `#B4634E` | 자동차 구조용 열연강판 | 고강도·성형성·용접성을 고려한 계열 |
| DP590 | `#2B527A` | 자동차용 고강도강 | DP 복합조직 계열 · 공급 형태와 세부 규격 별도 확인 |
| SGCC | `#B9D6D9` | 용융아연도금강판 | 일반용 · 아연 도금층을 통한 내식성 |

SPCC·SPCD·SPCE·SPCEN은 [POSCO Vietnam 공식 냉연 카탈로그의 제품 특성 표(p.10–11)](https://www.poscovietnam.com/images/product/2024_Catalogue_edit.pdf#page=6)를 근거로 짧게 설명한다. SPCEN의 구체적인 비시효 보증은 해당 주문 규격을 확인한다.

SPFH590의 자동차 구조용 분류는 [POSCO 열연강재 카탈로그](https://posco.co.kr/homepage/docs/kor5/dn/product/info/hotrolled.pdf), SPHC의 열연계·산세 제품 안내는 [현대제철 공식 제품 안내](https://www.hyundai-steel.com/kr/product-tech/cold-rolled)를 참조한다. SPHC라는 강종만으로 현재 산세·급유 상태를 확정하지 않는다.

DP590의 제품 계열은 [POSCO Maharashtra 공식 제품 안내](https://poscomaharashtra.com/in/product/product1.jsp), SGCC는 [POSCO 용융아연도금강판 카탈로그](https://www.posco.co.kr/homepage/docs/kor5/dn/product/info/galvanizedsteel.pdf)를 참조한다. DP590의 공급 형태나 SGCC의 도금량을 강종 이름만으로 추정하지 않는다.

## 강종이 없는 기존 LOT

현재 등록된 원본 14개 LOT에는 GRADE가 없다. LOT 번호를 강종으로 추정하거나 예시 강종을 실제 기록에 배정하지 않는다.

조회 코일 카드의 `강종 연결`을 누르고 제품 라벨·작업 지시서 등으로 확인한 실제 강종을 선택한다. `이 LOT에 연결`을 누르면 해당 자료 묶음·LOT에 제품군·특성·색상이 연결된다. 다른 LOT로 이동한 뒤 돌아와도 유지되며 팀이 같은 연결 정보를 조회한다.

연결은 Dataset의 별도 메타데이터에 보관한다. 원본 CSV, MeasurementFrame의 강종·관측값, LotSummary의 원자료 강종은 바꾸지 않는다. 화면에는 `담당자 연결`을 표시한다. 원자료 GRADE가 있으면 이를 우선하고 이 연결 창에서는 변경하지 않는다. 등록되지 않은 강종은 설명을 임의로 붙이지 않는다.

팀 담당자만 연결을 저장할 수 있다. LOT별 수정 번호를 검사하여 다른 담당자의 연결을 오래된 화면에서 덮어쓰지 않는다. 기존 DB 구조를 추가로 변경할 필요는 없다.
