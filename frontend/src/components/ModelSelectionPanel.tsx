import { BrainCircuit, Check, EyeOff, Sigma } from 'lucide-react';
import './ModelSelectionPanel.css';

export type AnalysisModel = 'zscore' | 'none';
type ModelChoice = AnalysisModel | 'randomforest';

export default function ModelSelectionPanel({ selected, disabled, live = false, onSelect, onOpenAnalysis }: {
  selected: ModelChoice; disabled: boolean; live?: boolean;
  onSelect: (model: ModelChoice) => void; onOpenAnalysis: () => void;
}) {
  const choices: ModelChoice[] = live ? ['randomforest', 'zscore', 'none'] : ['zscore', 'none'];
  return <div className="model-selection">
    <p>{live ? 'CSV에서 도착한 값으로 끝난 1분을 예측함.' : '과거 LOT에 저장된 이상 후보를 확인함.'}</p>
    <div className="model-options" role="radiogroup" aria-label="사용할 분석 모델" onKeyDown={event => {
      if (disabled || !['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
      const next = event.key === 'Home' ? choices[0] : event.key === 'End' ? choices.at(-1)!
        : choices[(Math.max(0, choices.indexOf(selected)) + direction + choices.length) % choices.length];
      onSelect(next);
      event.currentTarget.querySelector<HTMLButtonElement>(`[data-model="${next}"]`)?.focus();
    }}>
      {live && <button className="model-option" role="radio" aria-checked={selected === 'randomforest'}
        data-model="randomforest" tabIndex={selected === 'randomforest' ? 0 : -1} disabled={disabled} onClick={() => onSelect('randomforest')}>
        <BrainCircuit size={24} aria-hidden="true" /><span><strong>RandomForestClassifier</strong>
          <small>Z3~Z6는 구역별 활성 모델 사용. 그 밖의 구역은 Z-score 사용.</small>
          <em>2024년 팀·통계 라벨 학습 · 고장 원인 채널은 따로 확인</em></span>
        {selected === 'randomforest' && <Check size={19} aria-label="선택됨" />}
      </button>}
      <button className="model-option" role="radio" aria-checked={selected === 'zscore'}
        data-model="zscore" tabIndex={selected === 'zscore' ? 0 : -1} disabled={disabled} onClick={() => onSelect('zscore')}>
        <Sigma size={24} aria-hidden="true" /><span><strong>Z-score</strong>
          <small>{live ? '같은 LOT에서 앞서 도착한 값의 평균 ±3σ와 비교' : '선택한 LOT 전체의 평균 ±3σ를 벗어난 값'}</small>
          <em>{live ? '앞의 30분이 쌓이면 계산 · 미래 값 사용 안 함' : '과거 자료 분석 · 미래 고장 예측 아님'}</em></span>
        {selected === 'zscore' && <Check size={19} aria-label="선택됨" />}
      </button>
      <button className="model-option" role="radio" aria-checked={selected === 'none'}
        data-model="none" tabIndex={selected === 'none' ? 0 : -1} disabled={disabled} onClick={() => onSelect('none')}>
        <EyeOff size={24} aria-hidden="true" /><span><strong>추가 분석 끄기</strong><small>원자료 재생과 저장된 점검 요청은 유지함.</small></span>
        {selected === 'none' && <Check size={19} aria-label="선택됨" />}
      </button>
    </div>
    {!live && selected === 'zscore' && <button className="primary-button" disabled={disabled} onClick={onOpenAnalysis}>Z-score 분석과 저장된 후보 보기</button>}
    <div className="model-next"><p>{live ? '끝난 분의 온도·출력·CP와 지난 값을 서버가 계산함. CSV의 LABEL·EXCLUDED는 모델 입력에 넣지 않음.' : 'RandomForestClassifier는 실시간 CSV 시연 탭에서 선택할 수 있음.'}</p>
      <p>CSV 시연은 실제 설비 수집이나 별도 성능 평가가 아님.</p></div>
  </div>;
}
