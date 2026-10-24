import { ArrowLeft, Radio, Play, Pause } from 'lucide-react'
import type { LiveReview } from './useLiveReview'
import ThemedSelect from './components/ThemedSelect'
import { clockTime } from './time'

export default function LiveReviewControls({ review, receiving, ended, onBack, onSeek, onLive }: {
  review: LiveReview; receiving: boolean; ended: boolean; onBack: () => void; onSeek: (time: number) => void; onLive: () => void;
}) {
  const ready = Number.isFinite(review.latest), lag = ready ? Math.max(0, Math.round((review.latest - review.position) / 1000)) : 0
  return <section className={`playback-control live-review-control${review.following ? '' : ' is-reviewing'}`} aria-label="실시간 수신과 이전 기록 보기" title="←·→ 5초, Shift+←·→ 30초 이동 · 이전 기록에서 Space 재생·정지" aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Space">
    <div className="live-review-state"><span className={receiving ? 'live-reception-dot receiving' : 'live-reception-dot'} />
      <strong>{review.following ? ended ? '수신 완료' : receiving ? '실시간 수신 중' : '수신 대기' : '이전 기록 보는 중'}</strong>
      <span>{review.following ? ready ? clockTime(review.latest, true) : '첫 관측 대기' : `${lag}초 전 · 수신은 계속 진행`}</span>
      {review.following && <small>1×</small>}
      {!review.following && <small className="live-review-shortcut-hint">← → 5초 · Shift 30초</small>}
    </div>
    <div className="live-review-actions">
      <button className="subtle-button" onClick={onBack} disabled={!ready || review.position <= review.first} aria-label="이전 수신 기록 30초 전 보기"><ArrowLeft size={16} /><span>30초 전</span></button>
      {!review.following && <>
        <button className="icon-button" onClick={review.toggle} aria-label={review.playing ? '이전 기록 일시정지' : '이전 기록 재생'}>{review.playing ? <Pause size={19} /> : <Play size={19} />}</button>
        <div className="live-review-track"><input type="range" aria-label="수신한 기록에서 조회할 시각" min={review.first} max={review.latest} step={1000} value={review.position} onChange={event => onSeek(Number(event.target.value))} />
          <span>{clockTime(review.position, true)}</span></div>
        <ThemedSelect label="이전 기록 재생 속도" value={String(review.speed)} onChange={value => review.setSpeed(Number(value))}
          options={[1, 2, 4, 8, 16].map(value => ({ value: String(value), label: `${value}×` }))} />
      </>}
      <button className={`subtle-button return-to-live${review.following ? ' is-live' : ''}`} onClick={onLive} disabled={review.following}><Radio size={16} /><span>{review.following ? '현재' : '현재로'}</span></button>
    </div>
  </section>
}
