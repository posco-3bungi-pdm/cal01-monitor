import { AlertTriangle, ArrowRight, BrainCircuit, ClipboardList, LoaderCircle } from 'lucide-react';
import type { LiveModel, ModelEvent, ModelPredictions } from './model-predictions';
import { modelName } from './model-predictions';
import { dateTime, numberText } from './time';
import './LivePredictionsPanel.css';

export default function LivePredictionsPanel({ model, result, previous = [], error, pending, selectedEvent, onEvent, onRequest, onRetry }: {
  model: LiveModel; result: ModelPredictions | null; previous?: ModelPredictions[]; error: string; pending: boolean; selectedEvent: ModelEvent | null;
  onEvent: (event: ModelEvent) => void; onRequest: (event: ModelEvent) => void; onRetry: () => void;
}) {
  return <section className="live-predictions" aria-label="도착한 데이터의 모델 예측">
    <header><BrainCircuit size={18} /><strong>{model === 'randomforest' ? 'RandomForestClassifier' : model === 'zscore' ? 'Z-score' : '모델 예측 꺼짐'}</strong>{pending && <LoaderCircle size={16} className="spin" aria-label="예측 계산 중" />}</header>
    <p>{model === 'none' ? 'CSV 재생만 진행함. 새 모델 예측은 계산하지 않음.' : model === 'randomforest' ? 'CSV 시연 · 끝난 1분만 예측함. Z3~Z6 밖은 Z-score로 확인함.' : 'CSV 시연 · 앞서 도착한 값으로 끝난 1분을 확인함.'}</p>
    {error && <div className="form-error" role="alert">{error}<button className="text-button" onClick={onRetry}>다시 시도</button></div>}
    {model !== 'none' && !result && !error && <p role="status">첫 예측을 기다리는 중</p>}
    {result && <>
      <div className="prediction-zones">{result.predictions.map((item, index) => <div key={`${item.zone_id}:${item.model_id}:${index}`} className={item.prediction === 1 ? 'prediction-zone warning' : 'prediction-zone'}>
        <strong>{item.zone_id}</strong><span>{item.status !== 'ready' ? '데이터 쌓는 중' : item.prediction === 1 ? '이상 후보' : item.kind === 'RandomForest' ? '이상 후보 아님' : '기준 안'}</span>
          <small>{modelName(item.kind)}{item.kind === 'RandomForest' && item.probability != null ? ` · 이상 분류 점수 ${numberText(item.probability * 100)}%` : ''}</small>
        <small>{item.status !== 'ready' ? item.reason : item.minute ? dateTime(item.minute, true) : ''}</small>
      </div>)}</div>
      <p className="prediction-evidence">RandomForestClassifier는 구역을 판단함. 원인 채널과 고장 여부는 그래프를 보고 따로 확인해야 함.</p>
      <h3>예측으로 찾은 구간 <span>{result.event_count ?? result.events.length}</span></h3>
      {result.events_truncated && <p>전체 {result.event_count}개 중 최근 {result.events.length}개만 표시함.</p>}
      {result.events.length === 0 ? <p className="muted">지금까지 계산한 분에서 이상 후보 없음.</p> : <ol className="model-event-list">{[...result.events].reverse().map(event => <li key={event.id} className={selectedEvent?.id === event.id ? 'selected' : ''}>
        <button onClick={() => onEvent(event)} aria-label={`${event.zone_id} ${dateTime(event.start, true)} 이상 후보 그래프`}><AlertTriangle size={16} /><span><strong>{event.zone_id} · {modelName(event.kind)}</strong><small>{dateTime(event.start, true)} — {dateTime(event.end, true)}</small></span><ArrowRight size={16} /></button>
        <button className="text-button" onClick={() => onRequest(event)}><ClipboardList size={15} />점검 요청</button>
      </li>)}</ol>}
      <details><summary>이번 예측 기준</summary>{result.predictions.map((item, index) => <p key={`${item.model_id}:${index}`}><strong>{item.zone_id}</strong> · {item.model_id}<br />{item.evidence}</p>)}<p>{result.closed_minutes}개 완료 분 · 원자료 LABEL은 모델 입력에 넣지 않음.</p></details>
    </>}
    {previous.some(item => item.events.length > 0) && <><h3>앞서 끝난 LOT의 이상 후보</h3>{previous.filter(item => item.events_truncated).map(item => <p key={item.lot_no}>LOT {item.lot_no} · 전체 {item.event_count}개 중 최근 {item.events.length}개 표시함.</p>)}<ol className="model-event-list">{previous.flatMap(item => item.events).reverse().map(event => <li key={`${event.lot_no}:${event.id}`}>
      <button onClick={() => onEvent(event)}><AlertTriangle size={16} /><span><strong>LOT {event.lot_no} · {event.zone_id}</strong><small>{dateTime(event.start, true)} — {dateTime(event.end, true)}</small></span><ArrowRight size={16} /></button>
      <button className="text-button" onClick={() => onRequest(event)}><ClipboardList size={15} />점검 요청</button>
    </li>)}</ol></>}
  </section>;
}
