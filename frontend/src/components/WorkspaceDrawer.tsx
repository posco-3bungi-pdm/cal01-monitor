import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export default function WorkspaceDrawer({ open, title, name, onClose, children }: {
  open: boolean; title: string; name: string; onClose: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement;
    panel.current?.focus();
    return () => {
      if (previousFocus.current?.isConnected && previousFocus.current.getClientRects().length) previousFocus.current.focus();
      else document.querySelector<HTMLButtonElement>('[aria-label="설비 전체 화면"]')?.focus();
    };
  }, [open]);
  return <section ref={panel} className={`workspace-drawer drawer-${name}`} hidden={!open}
    role="dialog" aria-modal="false" aria-label={title} tabIndex={-1}
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    }}>
    <header className="drawer-header"><div><span className="eyebrow">CAL01 / {name.toUpperCase()}</span><h2>{title}</h2></div>
      <button className="icon-button" onClick={onClose} aria-label={`${title} 닫기`}><X size={19} /></button>
    </header>
    <div className="drawer-scroll">{children}</div>
  </section>;
}
