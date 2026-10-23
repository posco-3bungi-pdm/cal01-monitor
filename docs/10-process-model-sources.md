# 3D 공정과 부품의 근거

실제 CAL01 도면이 없어 위치·치수·배관은 설명용으로 만들었음. 원자료 온도와 설명용 동작은 별개다.

| 화면에 넣은 것 | 근거와 적용 범위 |
| --- | --- |
| 분사 → 브러시 → 헹굼 → 물기 제거 → 건조 | [Tenova 세정 장치](https://tenova.com/technologies/electrolytic-cleaning-lines), [ANDRITZ 세정·건조 예시](https://www.andritz.com/resource/blob/19312/883e977654f8195fb95a85a12db12c08/me-success-vas-ccl2-en-data.pdf), [Tenova 액체 반출을 줄이는 롤 설명](https://tenova.com/sites/default/files/2021-12/2011-STI%20April%20.pdf). 장치 역할을 재현했으며 이 순서가 실제 CAL01에 설치됐다는 뜻은 아님. |
| 강판의 옅은 잔유·물기와 건조 | 세정 전후를 이해하기 위한 표현. CLN-IN은 세정 온도이고 잔유량·세정 효과를 측정하지 않으므로 값에 따라 표면을 바꾸지 않음. |
| 기본 회색 강판 | [Nippon Steel 냉연강판 자료](https://www.nipponsteel.com/product/catalog_download/pdf/U003en.pdf)의 강종과 표면 마무리 구분을 참고. 제공 자료에 표면 마무리가 없어 강종별 질감을 만들지 않음. |
| 가스 분석함·시료 배관 | [ABB 시료 채취·전처리 장치](https://new.abb.com/products/measurement-products/analytical/continuous-gas-analyzers-sample-handling). 분석함 구조는 예시이며 CP-Z4·CP-Z4M과의 연결은 미확인. |
| 오일씰의 하우징·고무 립·스프링 | [SKF 회전축 씰 구조](https://cdn.skfmediahub.skf.com/api/public/0901d1968099986c/pdf_preview_medium/0901d1968099986c_pdf_preview_medium.pdf). 특정 제조사 제품을 복제하지 않고 회전축 밀봉 원리를 표현함. |
| 고정 플랜지 안의 O링 | [Parker O링 자료](https://www.parker.com/content/dam/Parker-com/Literature/O-Ring-Division-Literature/ORD-5700.pdf). 회전축 오일씰과 구분해 고정 연결부의 홈을 막는 부품으로 표현함. |
| 온도·산소 프로브 | [Eurotherm 노내 프로브](https://www.eurotherm.com/en/products/ancillary-equipment-en/probes-en/ap2-in-situ-carbon-probe/). 서로 다른 부품으로 표시. 실제 TC 종류·CP 연결은 단정하지 않음. |
| 외부 버너와 노 안의 래디언트 튜브 | [ANDRITZ 연속 소둔로 사례](https://www.andritz.com/resource/blob/19508/875528a8607601b1a4bf656442369fb8/me-article-heat-processing-1-2016-en-data.pdf)는 가열·균열 모두 복사관을 사용함. 화면은 복사관 안의 연소 경로와 강판 통로를 분리한 설명 모형. 자료의 W형 제품을 복제하거나 CAL01의 관 형식·수량을 확정한 것이 아님. |
| 연소 공기 송풍기, 배기·열회수 장치 | [Fives 복사관 버너](https://www.fivesgroup.com/energy-combustion/burners-systems/north-american-evenglow)의 버너·레큐퍼레이터 구성을 참고함. 뜨거운 배기로 공급 공기를 예열하는 역할을 표시. 강판 주변 분위기를 순환시키는 팬과 구분함. |
| 외함 안쪽 단열층 | [Morgan 내화섬유 단열 블록](https://www.morganthermalceramics.com/media/4425/z-blokrefractoryfibremodulesenglish-new.pdf)의 산업용 노 단열 역할을 참고함. CAL01에 설치된 특정 제품을 뜻하지 않음. |

`G-02_정비이력.csv`의 `P1-CR1-CAL01` 작업번호를 `G-02_부품교체이력.csv`와 연결하고 `G-01_부품마스터.csv`로 이름을 확인했다. `INS-006`, `SEL-006`, `SEL-009`는 각각 3건으로 총 9개 교체 행·8개 작업번호다. `HTR-006`과 `HTR-008`은 마스터에만 있고 CAL01 교체 행은 없다. 원본 파일은 수정하지 않았다.

열 아지랑이는 실제 온도를 참고하는 설명용 굴절이다. 고장 표시나 유체 계산 결과가 아니다. 모든 구역이 가로·세로 최대 1,024픽셀의 배경 버퍼 하나를 공유하고, 정지 화면은 요청 때만, 움직이는 화면은 초당 최대 24회 배경을 다시 그린다. 카메라가 움직일 때는 화면이 밀리지 않도록 즉시 갱신한다. 강판 질감은 경로의 누적거리를 사용해 수직 이동에서도 이어진다.

모형·재질·효과는 직접 작성한 코드이며 외부 3D 파일이나 제품 이미지는 포함하지 않았다.

Z3~Z6는 가열·균열 구역으로 함께 표시한다. 가열과 균열의 정확한 경계는 제공 자료에 없다. 이번 모형은 복사관 방식이며 전기 히터·직접가열·축열식 버너를 모두 섞지 않았다. OP 값으로 화염 크기나 실제 연료 유량을 만들지 않고, TC 값으로 복사관 표면온도를 단정하지 않는다. 신규 장비는 교체 기록이나 기존 채널 좌표를 수정하지 않는다.
