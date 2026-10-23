import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Check, RefreshCw, WifiOff, X } from "lucide-react";
import { api, queryString } from "../api";
import type { CandidateLocation, TeamNotification } from "../review-types";
import { activityTime } from "../review-types";

export default function TeamNotifications({ username, onOpenCandidate, onOpenRequests, onOpen }: {
  username: string; onOpenCandidate: (location: CandidateLocation) => void; onOpenRequests: (requestId?: string) => void;
  onOpen?: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<TeamNotification[]>([]);
  const [disconnected, setDisconnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [seen, setSeen] = useState(() => { try { return Number(localStorage.getItem(`cal01-notifications-seen-${username}`)) || 0; } catch { return 0; } });
  const after = useRef(0);
  const items = useRef(new Map<number, TeamNotification>());
  const busy = useRef(false);
  const active = useRef(true);
  const openRef = useRef(open);
  const trigger = useRef<HTMLButtonElement>(null);
  openRef.current = open;
  const markSeen = useCallback((id: number) => {
    setSeen(id);
    try { localStorage.setItem(`cal01-notifications-seen-${username}`, String(id)); } catch { /* Optional reading preference. */ }
  }, [username]);
  const poll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    let received = false;
    try {
      for (let page = 0; page < 10; page++) {
        const result = await api<{ notifications: TeamNotification[]; last_id: number; has_more: boolean }>(`/api/notifications?${queryString({ after: after.current, limit: 100 })}`);
        if (!active.current) return;
        for (const notification of result.notifications) {
          if (!items.current.has(notification.id)) received = true;
          items.current.set(notification.id, notification);
        }
        const previous = after.current;
        after.current = Math.max(after.current, result.last_id);
        if (!result.has_more || after.current <= previous) break;
      }
      if (!active.current) return;
      setDisconnected(false);
      setLoaded(true);
      if (received) {
        setNotifications([...items.current.values()].sort((a, b) => b.id - a.id));
        void queryClient.invalidateQueries({ queryKey: ["field-requests"] });
        void queryClient.invalidateQueries({ queryKey: ["detection-candidates"] });
        void queryClient.invalidateQueries({ queryKey: ["detection-runs"] });
      }
      if (openRef.current) markSeen(after.current);
    } catch { if (active.current) setDisconnected(true); }
    finally { busy.current = false; }
  }, [markSeen, queryClient]);
  useEffect(() => {
    active.current = true; void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { active.current = false; window.clearInterval(timer); };
  }, [poll]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation(); event.preventDefault();
      setOpen(false); trigger.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [open]);
  const unread = notifications.filter(notification => notification.id > seen).length;
  function toggle() { if (!open) { onOpen?.(); markSeen(after.current); } setOpen(value => !value); }
  return <div className="notification-center">
    <button ref={trigger} className={`notification-button ${disconnected ? "disconnected" : ""}`} aria-label={`팀 알림 ${unread}개 읽지 않음${disconnected ? " · 연결 끊김" : ""}`} aria-expanded={open} onClick={toggle}>{disconnected ? <WifiOff size={17} /> : <Bell size={17} />}{unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}</button>
    {open && <section className="notification-popover" aria-label="팀 알림 목록"><header><strong>팀 알림</strong><span>{disconnected ? "연결 끊김" : "5초마다 확인"}</span><button className="icon-button" onClick={() => setOpen(false)} aria-label="알림 목록 닫기"><X size={15} /></button></header>
      {disconnected && <div className="notification-reconnect"><WifiOff size={14} /><span>새 알림을 받지 못하고 있습니다.</span><button className="text-button" onClick={() => void poll()}><RefreshCw size={13} />다시 확인</button></div>}
      <div className="notification-items">{notifications.length === 0 ? <p>{loaded ? "아직 팀 알림이 없습니다." : "팀 알림을 불러오는 중입니다."}</p> : notifications.map(notification => <button key={notification.id} onClick={() => {
        setOpen(false);
        if (notification.request_id) onOpenRequests(notification.request_id);
        else if (notification.candidate_id && notification.dataset_id && notification.lot_no) onOpenCandidate({ candidate_id: notification.candidate_id, dataset_id: notification.dataset_id, lot_no: notification.lot_no, run_id: notification.run_id });
        else onOpenRequests(notification.request_id ?? undefined);
      }}><strong>{notification.title}</strong><span>{notification.actor?.display_name ?? "시스템"} · {activityTime(notification.created_at)}</span></button>)}</div>
      <footer><Check size={12} />읽음 표시는 이 브라우저에만 남습니다.</footer>
    </section>}
  </div>;
}
