import { AlertTriangle, ArrowRight, ChevronDown, RefreshCw } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { dateTime } from '../time'
import type { DetectionCandidate } from '../review-types'

export default function PendingAttention({ candidates, count, error, onRetry, onSelect }: {
  candidates: DetectionCandidate[]; count: number; error: unknown; onRetry: () => void; onSelect: (item: DetectionCandidate) => void
}) {
  const banner = useRef<HTMLElement>(null)
  const visible = Boolean(count || error)
  useLayoutEffect(() => {
    const node = banner.current, root = node?.closest<HTMLElement>('.immersive')
    if (!node || !root) return
    const update = () => root.style.setProperty('--pending-alert-height', `${node.offsetHeight}px`)
    const observer = new ResizeObserver(update); observer.observe(node); update()
    return () => { observer.disconnect(); root.style.removeProperty('--pending-alert-height') }
  }, [visible])
  if (!count && !error) return null
  return <section ref={banner} className="pending-alert-banner" aria-label="재생 중 발생한 미조치 후보" data-scene-ui>
    <div className="pending-alert-heading"><AlertTriangle size={20} /><div><strong>미조치 {count}건</strong><small>재생 중 발생 · 조치 완료 전까지 유지</small></div>
      {candidates[0] && <button onClick={() => onSelect(candidates[0])} className="pending-alert-open">확인 필요<ArrowRight size={15} /></button>}
    </div>
    {error ? <div className="pending-alert-error" role="alert">목록 갱신 실패 · 기존 항목 유지<button onClick={onRetry} aria-label="미조치 목록 다시 확인"><RefreshCw size={15} /></button></div> : null}
    {candidates.length > 0 && <details className="pending-alert-list"><summary>미조치 목록<ChevronDown size={14} /></summary><div role="list">
      {candidates.map(item => <button key={item.id} role="listitem" onClick={() => onSelect(item)}><strong>{item.lot_no} · {item.zone_id} · {item.channel_id}</strong><span>{dateTime(item.start, true)} · {item.open_request ? '점검 진행 중' : item.acknowledged ? '읽음 · 미조치' : '미확인'}</span></button>)}
      {count > candidates.length && <p>전체 {count}건 중 {candidates.length}건 표시 · 저장된 분석에서도 조회 가능</p>}
    </div></details>}
  </section>
}
