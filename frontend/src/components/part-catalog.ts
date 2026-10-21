export type ProcessPart = {
  id: string
  name: string
  partCode: string
  zoneId: string
  position: [number, number, number]
  description: string
  evidence: 'cal01-replacement' | 'master-only'
  note: string
  sources: { title: string; url: string }[]
  workOrderIds: string[]
}

// Positions are representative teaching locations, not recovered plant coordinates.
// Replacement links come from CAL01 work orders joined to parts by WO_NO.
export const PART_CATALOG: ProcessPart[] = [
  {
    id: 'INS-006', name: '가스 분석계 셀', partCode: 'INS-006', zoneId: 'Z4',
    position: [-3.2, 1.7, 4.15],
    description: '채취한 가스를 분석하는 부품. 화면에서는 시료 배관과 분석함을 함께 보여줌.',
    evidence: 'cal01-replacement',
    note: 'CAL01 교체 기록 3건. 실제 채취 위치와 CP-Z4·CP-Z4M 연결은 자료에 없음.',
    sources: [{ title: 'ABB · 시료 채취와 전처리 장치', url: 'https://new.abb.com/products/measurement-products/analytical/continuous-gas-analyzers-sample-handling' }],
    workOrderIds: ['WO-2024-00776', 'WO-2024-01178', 'WO-2024-02105'],
  },
  {
    id: 'SEL-006', name: '오일씰', partCode: 'SEL-006', zoneId: 'Z4',
    position: [-4.65, 1.76, 2.25],
    description: '회전축과 고정된 하우징 사이를 막는 부품. 축에 닿는 고무 립이 윤활유 누출과 이물 유입을 줄임.',
    evidence: 'cal01-replacement',
    note: 'CAL01 교체 기록 3건. 부품마스터 규격은 150×190×18. 화면의 축 위치와 크기는 설명용임.',
    sources: [{ title: 'SKF · 회전축 씰의 구조', url: 'https://cdn.skfmediahub.skf.com/api/public/0901d1968099986c/pdf_preview_medium/0901d1968099986c_pdf_preview_medium.pdf' }],
    workOrderIds: ['WO-2024-00508', 'WO-2024-00916', 'WO-2024-01346'],
  },
  {
    id: 'SEL-009', name: 'O링', partCode: 'SEL-009', zoneId: 'Z4',
    position: [-2.42, 2.14, 3.55],
    description: '고정된 연결부의 홈에 끼우고 눌러서 틈을 막는 고무 링. 선택하면 연결부를 벌려 링을 보여줌.',
    evidence: 'cal01-replacement',
    note: 'CAL01 교체 기록 3건. 어느 연결부에 쓰였는지는 자료에 없어 대표적인 플랜지 모형으로 표현함.',
    sources: [{ title: 'Parker · O링과 홈의 밀봉 원리', url: 'https://www.parker.com/content/dam/Parker-com/Literature/O-Ring-Division-Literature/ORD-5700.pdf' }],
    workOrderIds: ['WO-2024-00597', 'WO-2024-00916', 'WO-2024-01094'],
  },
  {
    id: 'HTR-006', name: 'R형 열전대', partCode: 'HTR-006', zoneId: 'Z3',
    position: [-7.9, 5.3, 1.9],
    description: '노 내부에 넣은 끝부분의 온도를 측정하는 계기. 보호관과 바깥쪽 연결 헤드를 보여줌.',
    evidence: 'master-only',
    note: '부품마스터에만 있음. CAL01 교체 기록과 특정 TC 채널의 열전대 종류는 확인되지 않음.',
    sources: [{ title: 'Eurotherm · 노내 프로브와 온도 측정', url: 'https://www.eurotherm.com/en/products/ancillary-equipment-en/probes-en/ap2-in-situ-carbon-probe/' }],
    workOrderIds: [],
  },
  {
    id: 'HTR-008', name: 'CP 산소 프로브', partCode: 'HTR-008', zoneId: 'Z4',
    position: [-4.55, 4.8, 1.9],
    description: '노 안의 분위기를 확인하는 프로브. 온도계나 가스 분석함과는 별도 부품으로 표시함.',
    evidence: 'master-only',
    note: '부품마스터에만 있음. CAL01 교체 기록·채널 연결·설치 위치는 확인되지 않음.',
    sources: [{ title: 'Eurotherm · 노내 산소·탄소 프로브', url: 'https://www.eurotherm.com/en/products/ancillary-equipment-en/probes-en/ap2-in-situ-carbon-probe/' }],
    workOrderIds: [],
  },
]
