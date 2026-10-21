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
export default function EquipmentAlert({ alert, onAcknowledge, onFocus }: {
  alert: EquipmentAlertData;
  onAcknowledge: (id: string) => void;
  onFocus: (alert: EquipmentAlertData) => void;
}) {
  return <>
    {!alert.acknowledged && <div className="warning-edge-pulse" aria-hidden="true" />}
    <section className="equipment-alert" role={alert.acknowledged ? "status" : "alert"}>
      <AlertTriangle size={22} />
      <div><strong>{alert.severity === "confirmed" ? "팀이 확인한 이상" : "이상 후보"} · {alert.equipment} / {alert.zone} / {alert.channel}</strong>
        <p>{numberText(alert.value)} {alert.unit} · {dateTime(alert.time, true)} · {alert.reason}</p>
        {alert.acknowledged && <p>확인함 · 표시 움직임을 멈췄습니다. 이상 상태를 해결 처리한 것은 아닙니다.</p>}
      </div>
      <div className="equipment-alert-actions"><button className="subtle-button" onClick={() => onFocus(alert)}><Crosshair size={14} />해당 채널 보기</button>
        {!alert.acknowledged && <button className="subtle-button" onClick={() => onAcknowledge(alert.id)}><Check size={14} />확인 · 움직임 끄기</button>}
      </div>
    </section>
  </>;
}
