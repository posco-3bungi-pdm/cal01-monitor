import { useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Crosshair, ClipboardList } from 'lucide-react'
import type { DetectionCandidate } from '../review-types'
import { dateTime, timeMs } from '../time'

const STEPS = [
  { title: '어디서·언제 발생했는지 확인', checks: ['LOT·구역·채널과 발생 시작·종료 시각을 확인한다.', '값 아래의 실제 관측 시각과 결측·긴 관측 공백을 확인한다. 기록이 없으면 복귀 여부도 판단할 수 없다.'], result: '확인한 구간과 기록 유무를 정리한다.' },
  { title: '같은 구역의 TC·OP 비교', checks: ['같은 시간축에서 TC(온도 계열)와 OP(제어 출력)를 비교한다. 출력을 바꾼 뒤 온도가 늦게 반응할 수 있다.', '강종·소재 조건·설정값·라인 속도·앞뒤 조업 기록을 함께 확인한다. 제공되지 않은 조건은 미확인으로 남긴다.'], result: 'TC가 일정해도 OP는 변할 수 있다. 함께 변했다는 이유만으로 버너·센서 고장을 확정하지 않는다.' },
  { title: '운전 변화와 겹치는지 확인', checks: ['강종 변경·정지·재가동·설정 변경·정비 시각과 비교한다.', '240058 정기수리 전 정지, 240061 정기수리 후 재가동이라는 팀 판단은 해당 LOT에만 적용한다.'], result: '기록으로 설명되면 근거를 남기고 관찰한다. 원인이 불분명하면 점검할 내용을 정리한다.' },
  { title: '필요한 점검을 요청', checks: ['채널·발생 구간·관측한 변화·비교한 TC/OP·확인하지 못한 조건을 요청에 적는다.', '기존 요청과 담당자를 확인해 중복 요청을 줄인다. 점검 범위와 담당은 사업장 절차에 따라 정한다.'], result: '이 화면은 확인과 기록을 돕는다. 실제 설비 조작·정지·재가동은 권한과 승인된 현장 절차에 따른다.' },
  { title: '결과와 복귀를 각각 확인', checks: ['담당자의 점검·수리 결과와 이후 관측값을 함께 확인한다. 미해결이면 후속 점검과 교대 인계에 남긴다.', '알림 확인, 값의 복귀, 작업 완료, 처리 종료를 구분한다. 현재 분석은 LOT 전체 고정 통계 기준이며 복귀 시점을 자동 판정하지 않는다.'], result: '이동 기준 Z값 감소는 시작 시점의 고정 기준에 따른 복귀와 다르다. 이 두 평가는 현재 화면에 제공되지 않으며 정상 복귀로 대신 표시하지 않는다.' },
]

export default function ResponseGuide({ candidate, candidates, onOpenGraph, onRequest }: {
  candidate: DetectionCandidate | null; candidates: DetectionCandidate[]
  onOpenGraph: (candidate: DetectionCandidate) => void; onRequest: (candidate: DetectionCandidate) => void
}) {
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const count = candidate ? candidates.filter(item => item.run_id === candidate.run_id && item.dataset_id === candidate.dataset_id && item.lot_no === candidate.lot_no && item.channel_id === candidate.channel_id).length : 0
  const seconds = candidate ? Math.max(0, (timeMs(candidate.end) - timeMs(candidate.start)) / 1000) : 0
  return <section className="response-guide" aria-label="이상 후보 대응 순서">
    <p className="response-intro"><BookOpen size={18} />이상 후보를 확인하고 점검 필요 여부를 판단하는 순서</p>
    <div className="response-navigation"><button className="subtle-button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={15} />이전</button><span>{index + 1} / {STEPS.length}</span><button className="primary-button compact" disabled={index === STEPS.length - 1} onClick={() => setIndex(index + 1)}>다음<ChevronRight size={15} /></button></div>
    {candidate ? <div className="response-context"><strong>LOT {candidate.lot_no} · {candidate.zone_id} · {candidate.channel_id}</strong><span>{dateTime(candidate.start, true)} — {dateTime(candidate.end, true)}</span><details><summary>구간 길이·반복 정보</summary><span>구간 길이 {seconds.toLocaleString()}초 · 관측 {candidate.point_count}개</span><small>구간 길이는 시작~종료 시각의 차이다. 공백 중 상태는 확인되지 않는다.</small><span>동일 분석·채널의 후보 {count || 1}개 구간{count > 1 ? ' · 동일 원인 여부 미확인' : ' · 반복 여부 추가 확인'}</span></details></div> : <p className="response-context">후보 선택 전이다. 이상 후보의 「대응 가이드」를 누르면 해당 LOT·채널·발생 구간을 함께 확인할 수 있다.</p>}
    <details className="response-outline"><summary>전체 대응 단계 보기</summary><nav className="response-stepper" aria-label="대응 단계">{STEPS.map((item, stepIndex) => <button key={item.title} aria-current={index === stepIndex ? 'step' : undefined} onClick={() => setIndex(stepIndex)}><span>{stepIndex + 1}</span>{item.title}</button>)}</nav></details>
    <article className="response-step" aria-live="polite"><span className="eyebrow">확인 {index + 1} / {STEPS.length}</span><h3>{step.title}</h3><ol>{step.checks.map(check => <li key={check}>{check}</li>)}</ol><p>{step.result}</p></article>
    <div className="response-actions"><button className="subtle-button" disabled={!candidate} onClick={() => candidate && onOpenGraph(candidate)}><Crosshair size={15} />해당 구간 그래프</button><button className="subtle-button" disabled={!candidate} onClick={() => candidate && onRequest(candidate)}><ClipboardList size={15} />점검 요청 작성</button></div>
    <details className="response-scope"><summary>적용 범위와 참고 근거</summary><p>이 앱의 과거 자료 검토를 위한 확인 가이드다. 설비별 승인 조작 매뉴얼은 제공되지 않았다. 목표값·경보 기준은 임의로 추가하지 않는다. 관측 평균은 목표값이나 정상 범위가 아니다.</p><p>알림이 필요한 판단·행동을 안내하도록 구성하고, 알림 확인 상태와 측정값 상태를 구분하는 원칙을 참고했다.</p><a href="https://www.hse.gov.uk/humanfactors/topics/alarm-management.htm" target="_blank" rel="noreferrer">HSE 알림 관리 원칙</a><a href="https://docs.inductiveautomation.com/docs/8.3/platform/alarming" target="_blank" rel="noreferrer">Ignition 알림 상태 설명</a></details>
  </section>
}
