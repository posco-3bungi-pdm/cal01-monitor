import { AlertTriangle, ClipboardList } from 'lucide-react'
import type { Channel, ChannelSeries } from './types'
import type { ModelEvent } from './model-predictions'
import { modelName } from './model-predictions'
import { clockTime, dateTime, numberText } from './time'
import { observedEventChanges } from './live-evidence'
import ReadingValue from './components/ReadingValue'

export default function LiveEventEvidence({ event, series, channels, aggregated, onRequest }: {
  event: ModelEvent; series: ChannelSeries[]; channels: Channel[]; aggregated: boolean; onRequest: () => void;
}) {
  const rows = observedEventChanges(series, event), forest = event.kind === 'RandomForest'
  return <section className="live-event-evidence" aria-label="선택한 이상 구간과 감지 근거">
    <header><span><AlertTriangle size={18} />{event.zone_id} 이상 징후 감지</span><small>{modelName(event.kind)}</small></header>
    <p className="live-event-period">{dateTime(event.start, true)} — {clockTime(event.end, true)}</p>
    <div className="live-event-reason"><strong>감지 근거</strong>
      <p>{forest ? '완료된 1분의 온도·출력 등 입력을 학습된 구역 모델이 이상으로 분류했습니다.' : `같은 LOT의 앞서 도착한 분 평균을 기준으로 ${event.channel_ids.join(' · ')}에서 3σ를 벗어난 변화를 감지했습니다.`}</p>
      {forest && event.probability != null && <span className="model-score">가장 높은 이상 분류 점수 <strong>{numberText(event.probability * 100)}%</strong></span>}
    </div>
    <div className="event-comparison-heading"><strong>함께 관측된 변화</strong><small>{aggregated ? '요약 관측값' : '원자료 관측값'}</small></div>
    <div className="event-comparison-table" role="table" aria-label="감지 구간 전후 계측값 비교">
      <div role="row"><span role="columnheader">채널</span><span role="columnheader">구간 직전</span><span role="columnheader">감지 구간 최솟값 ~ 최댓값</span></div>
      {rows.map(row => <div role="row" key={row.channelId}><strong role="cell">{row.channelId}</strong>
        <span role="cell"><ReadingValue channelId={row.channelId} value={row.before} decimals={row.channelId === 'CP-Z4' ? 4 : undefined} hideUnit /></span>
        <span role="cell"><ReadingValue channelId={row.channelId} value={row.min} decimals={row.channelId === 'CP-Z4' ? 4 : undefined} hideUnit /><i>~</i><ReadingValue channelId={row.channelId} value={row.max} decimals={row.channelId === 'CP-Z4' ? 4 : undefined} hideUnit /><small>{channels.find(channel => channel.id === row.channelId)?.unit ?? ''}</small></span></div>)}
    </div>
    <p className="live-evidence-note">그래프의 붉은 영역은 감지 구간, 점은 구간 내 비교값과 가장 차이 나는 관측값입니다. 관측 변화는 원인 채널의 확정이 아닙니다. {forest ? '분류 점수는 고장 확률이 아닙니다.' : ''}</p>
    {event.evidence && <details className="event-model-basis"><summary>모델 판단 기준</summary><p>{event.evidence}</p></details>}
    <button className="subtle-button" onClick={onRequest}><ClipboardList size={16} />이 구간 점검 요청</button>
  </section>
}
