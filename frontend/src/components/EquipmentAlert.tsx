import { AlertTriangle, Check, Crosshair } from "lucide-react";
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
export default function EquipmentAlert({ alert, onAcknowledge, onFocus, pending = false }: {
  alert: EquipmentAlertData;
  onAcknowledge: (id: string) => void;
  onFocus: (alert: EquipmentAlertData) => void;
  pending?: boolean;
}) {
  return <>
    {!alert.acknowledged && <div className="warning-edge-pulse" aria-hidden="true" />}
    <section className="equipment-alert" role={alert.acknowledged ? "status" : "alert"}>
      <AlertTriangle size={22} />
      <div><strong>과거 자료의 이상 후보 · {alert.equipment} / {alert.zone} / {alert.channel}</strong>
        <p>{numberText(alert.value)} {alert.unit} · {dateTime(alert.time, true)} · {alert.reason}</p>
        <p>{alert.acknowledged ? "팀 확인함 · 움직이는 강조를 멈췄습니다. 고장이나 해결 여부를 확정하지 않습니다." : "선택한 과거 LOT를 분석한 결과입니다. 현재 설비에서 새로 발생한 고장 경고가 아닙니다."}</p>
      </div>
      <div className="equipment-alert-actions"><button className="subtle-button" onClick={() => onFocus(alert)}><Crosshair size={14} />해당 채널 보기</button>
        {!alert.acknowledged && <button className="subtle-button" disabled={pending} onClick={() => onAcknowledge(alert.id)}><Check size={14} />{pending ? "저장 중" : "확인 · 움직임 끄기"}</button>}
      </div>
    </section>
  </>;
}
