import { HEATING_PART_VIEWS } from './heating-equipment-data'

export type ProcessPart = {
  id: string
  name: string
  partCode: string
  zoneId: string
  position: [number, number, number]
  description: string
  evidence: 'cal01-replacement' | 'master-only' | 'manufacturer-example'
  viewRadius?: number
  note: string
  sources: { title: string; url: string }[]
  workOrderIds: string[]
}

// Positions are representative teaching locations, not recovered plant coordinates.
// Operational evidence is served separately to authorized team accounts.
export const PART_CATALOG: ProcessPart[] = [
  {
    id: 'INS-006', name: '가스 분석계 셀', partCode: 'INS-006', zoneId: 'Z4',
    position: [-3.2, 1.7, 4.15],
    description: '채취한 가스를 분석하는 부품. 화면에서는 시료 배관과 분석함을 함께 보여줌.',
    evidence: 'manufacturer-example',
    note: '시료 배관과 분석함을 설명하기 위한 대표 모형. 실제 채취 위치와 CP 채널 연결은 현장 도면으로 확인해야 함.',
    sources: [{ title: 'ABB · 시료 채취와 전처리 장치', url: 'https://new.abb.com/products/measurement-products/analytical/continuous-gas-analyzers-sample-handling' }],
    workOrderIds: [],
  },
  {
    id: 'SEL-006', name: '오일씰', partCode: 'SEL-006', zoneId: 'Z4',
    position: [-4.65, 1.76, 2.25],
    description: '회전축과 고정된 하우징 사이를 막는 부품. 축에 닿는 고무 립이 윤활유 누출과 이물 유입을 줄임.',
    evidence: 'manufacturer-example',
    note: '회전축 씰의 밀봉 구조를 보여주는 대표 모형. 크기와 설치 위치는 설명용임.',
    sources: [{ title: 'SKF · 회전축 씰의 구조', url: 'https://cdn.skfmediahub.skf.com/api/public/0901d1968099986c/pdf_preview_medium/0901d1968099986c_pdf_preview_medium.pdf' }],
    workOrderIds: [],
  },
  {
    id: 'SEL-009', name: 'O링', partCode: 'SEL-009', zoneId: 'Z4',
    position: [-2.42, 2.14, 3.55],
    description: '고정된 연결부의 홈에 끼우고 눌러서 틈을 막는 고무 링. 선택하면 연결부를 벌려 링을 보여줌.',
    evidence: 'manufacturer-example',
    note: '플랜지 연결부에서 O링이 눌리는 구조를 보여주는 대표 모형. 실제 설치 위치와 규격은 현장 도면으로 확인해야 함.',
    sources: [{ title: 'Parker · O링과 홈의 밀봉 원리', url: 'https://www.parker.com/content/dam/Parker-com/Literature/O-Ring-Division-Literature/ORD-5700.pdf' }],
    workOrderIds: [],
  },
  {
    id: 'HTR-006', name: 'R형 열전대', partCode: 'HTR-006', zoneId: 'Z3',
    position: [-7.9, 5.3, 1.9],
    description: '노 내부에 넣은 끝부분의 온도를 측정하는 계기. 보호관과 바깥쪽 연결 헤드를 보여줌.',
    evidence: 'manufacturer-example',
    note: '보호관과 연결 헤드를 갖춘 열전대의 대표 모형. 실제 채널별 형식과 설치 위치를 뜻하지 않음.',
    sources: [{ title: 'Eurotherm · 노내 프로브와 온도 측정', url: 'https://www.eurotherm.com/en/products/ancillary-equipment-en/probes-en/ap2-in-situ-carbon-probe/' }],
    workOrderIds: [],
  },
  {
    id: 'HTR-008', name: 'CP 산소 프로브', partCode: 'HTR-008', zoneId: 'Z4',
    position: [-4.55, 4.8, 1.9],
    description: '노 안의 분위기를 확인하는 프로브. 온도계나 가스 분석함과는 별도 부품으로 표시함.',
    evidence: 'manufacturer-example',
    note: '노 분위기 측정 프로브의 대표 모형. 실제 채널 연결과 설치 위치를 뜻하지 않음.',
    sources: [{ title: 'Eurotherm · 노내 산소·탄소 프로브', url: 'https://www.eurotherm.com/en/products/ancillary-equipment-en/probes-en/ap2-in-situ-carbon-probe/' }],
    workOrderIds: [],
  },
  ...HEATING_PART_VIEWS.map((view): ProcessPart => {
    const zone = view.id.startsWith('HEAT-Z') ? view.id.slice(5) : 'Z3~Z6'
    const common = {
      ...view, partCode: '설명용 장비', zoneId: zone,
      evidence: 'manufacturer-example' as const, workOrderIds: [],
    }
    if (view.id === 'HEAT-AIR') return {
      ...common, name: '송풍기·연료 공급 배관',
      description: '송풍기는 연소에 필요한 공기를 보냄. 노란 배관은 연료 공급을 따로 표현함. 공기와 연료는 버너로 각각 들어가며, 강판 주변의 가스를 섞는 교반 팬과는 역할이 다름.',
      note: '공급 공기가 열회수 장치를 거쳐 버너로 가는 구성을 표현함. 실제 CAL01의 송풍기 규격·배관·유량은 자료에 없음.',
      sources: [{ title: 'Fives · 복사관 버너와 열회수', url: 'https://www.fivesgroup.com/energy-combustion/burners-systems/north-american-evenglow' }],
    }
    if (view.id === 'HEAT-RECUP') return {
      ...common, name: '배기·열회수 장치',
      description: '복사관에서 나온 뜨거운 배기로 공급 공기를 예열함. 배기와 공급 공기는 서로 섞이지 않고 열을 주고받음.',
      note: '공기와 배기의 두 통로를 보여주는 설명 모형. 실제 설비의 설치 방식·수량·열회수 성능을 뜻하지 않음.',
      sources: [{ title: 'Fives · 버너와 레큐퍼레이터', url: 'https://www.fivesgroup.com/energy-combustion/burners-systems/north-american-evenglow' }],
    }
    if (view.id === 'HEAT-LINING') return {
      ...common, name: '노 안쪽 단열층',
      description: '외함 안쪽을 감싸 열이 밖으로 빠져나가는 것을 줄임. 내부 보기에서 뒷벽의 밝은 블록으로 표시함.',
      note: '내화섬유 단열 블록을 참고한 모형. 실제 CAL01의 재질·두께는 자료에 없음.',
      sources: [{ title: 'Morgan · 산업용 노 단열 블록', url: 'https://www.morganthermalceramics.com/media/4425/z-blokrefractoryfibremodulesenglish-new.pdf' }],
    }
    return {
      ...common, name: `${zone} 버너·래디언트 튜브`,
      description: '외벽 밖 버너가 관 안에서 연료를 태움. 달궈진 관이 강판을 데우므로 불꽃과 연소가스가 강판에 직접 닿지 않음.',
      note: '내부 보기를 켜면 강판 앞뒤의 관이 보임. Z3~Z6는 가열·균열 구역으로 묶으며 정확한 경계와 실제 버너 수량은 확인되지 않음. OP는 제어 출력이고 화염 크기나 가스 유량이 아님.',
      sources: [{ title: 'ANDRITZ · 연속 소둔로의 복사관 가열·균열', url: 'https://www.andritz.com/resource/blob/19508/875528a8607601b1a4bf656442369fb8/me-article-heat-processing-1-2016-en-data.pdf' }],
    }
  }),
]
