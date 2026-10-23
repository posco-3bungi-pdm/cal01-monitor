import { BrainCircuit, Check, EyeOff, Sigma } from "lucide-react";
import "./ModelSelectionPanel.css";

export type AnalysisModel = "zscore" | "none";

export default function ModelSelectionPanel({ selected, disabled, onSelect, onOpenAnalysis }: {
  selected: AnalysisModel;
  disabled: boolean;
  onSelect: (model: AnalysisModel) => void;
  onOpenAnalysis: () => void;
}) {
  return <div className="model-selection">
    <p>이상 후보를 확인할 분석 기준을 선택하십시오.</p>
    <div className="model-options" role="radiogroup" aria-label="사용할 분석 모델" onKeyDown={event => {
      if (disabled || !["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "zscore" : event.key === "End" ? "none" : selected === "zscore" ? "none" : "zscore";
      onSelect(next);
      event.currentTarget.querySelector<HTMLButtonElement>(`[data-model="${next}"]`)?.focus();
    }}>
      <button className="model-option" role="radio" aria-checked={selected === "zscore"}
        data-model="zscore" tabIndex={selected === "zscore" ? 0 : -1}
        disabled={disabled} onClick={() => onSelect("zscore")}>
        <Sigma size={24} aria-hidden="true" />
        <span><strong>Z-score</strong><small>선택한 LOT 전체의 평균 ±3σ를 벗어난 값</small>
          <em>과거 자료 분석 · 미래 고장 예측 아님</em></span>
        {selected === "zscore" && <Check size={19} aria-label="선택됨" />}
      </button>
      <button className="model-option" role="radio" aria-checked="false" disabled>
        <BrainCircuit size={24} aria-hidden="true" />
        <span><strong>RandomForestClassifier <b>연결 전</b></strong>
          <small>2024년의 정상·이상 라벨을 학습한 분류 모델</small>
          <em>학습된 모델과 입력 컬럼 확인 후 선택할 수 있습니다.</em></span>
      </button>
      <button className="model-option" role="radio" aria-checked={selected === "none"}
        data-model="none" tabIndex={selected === "none" ? 0 : -1}
        disabled={disabled} onClick={() => onSelect("none")}>
        <EyeOff size={24} aria-hidden="true" />
        <span><strong>추가 분석 끄기</strong><small>새 분석 실행을 끕니다. 저장된 미조치 알림은 계속 표시합니다.</small></span>
        {selected === "none" && <Check size={19} aria-label="선택됨" />}
      </button>
    </div>
    {selected === "zscore" && <button className="primary-button" disabled={disabled} onClick={onOpenAnalysis}>Z-score 분석과 저장된 후보 보기</button>}
    <div className="model-next">
      <strong>RandomForestClassifier를 연결하려면</strong>
      <p>학습에 쓴 컬럼과 정상·이상 라벨 기준을 먼저 맞춥니다. 현재 자료에는 학습된 분류 모델 파일이 없습니다.</p>
      <p>2026년 실측은 그대로 예측에 넣고, 2024년 자료를 늘려 만든 일주일은 <b>합성 재생</b>으로 구분합니다.</p>
    </div>
  </div>;
}
