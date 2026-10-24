import { AlertTriangle, Check, Crosshair, BookOpen } from "lucide-react";
import { dateTime, numberText } from "../time";

export type EquipmentAlertData = {
  id: string;
  equipment: string;
  zone: string;
  channel: string;
  value: number | null;
  unit: string;
  time: string;
  reason: string;
  severity: "candidate" | "confirmed";
  acknowledged: boolean;
};

// Render only from an actual detection event. CSV labels do not activate this component.
export default function EquipmentAlert({ alert, onAcknowledge, onFocus, onGuide, pending = false, readOnly = false }: {
  alert: EquipmentAlertData;
  onAcknowledge: (id: string) => void;
  onFocus: (alert: EquipmentAlertData) => void;
  onGuide: () => void;
  pending?: boolean; readOnly?: boolean;
}) {
  return <>
    {!alert.acknowledged && <div className="warning-edge-pulse" aria-hidden="true" />}
    <section className="equipment-alert" role={alert.acknowledged ? "status" : "alert"}>
      <AlertTriangle size={20} aria-hidden="true" />
      <div className="equipment-alert-copy">
        <strong>과거 자료의 이상 후보 · {alert.channel}</strong>
        <p className="alert-recorded-value">{dateTime(alert.time, true)} · {numberText(alert.value)} {alert.unit}</p>
        <div className="alert-summary"><span>{alert.acknowledged ? "팀 확인함 · 고장 확정 아님" : "고장 확정 아님"}</span>
          <details className="alert-help"><summary>설명</summary><div><p>{alert.reason}</p><p>{alert.equipment} / {alert.zone}에서 기록한 값입니다. 현재 설비의 실시간 고장 경고가 아닙니다.</p><p>‘확인’은 후보를 읽었다는 표시입니다. 고장이나 해결 여부를 확정하지 않습니다.</p></div></details>
        </div>
      </div>
      <div className="equipment-alert-actions"><button className="subtle-button" onClick={() => onFocus(alert)}><Crosshair size={16} />구간 보기</button>
        <button className="subtle-button" onClick={onGuide}><BookOpen size={16} />대응 가이드</button>
        {!readOnly && !alert.acknowledged && <button className="subtle-button" disabled={pending} onClick={() => { if (!readOnly) onAcknowledge(alert.id); }}><Check size={16} />{pending ? "저장 중" : "확인"}</button>}
      </div>
    </section>
  </>;
}
