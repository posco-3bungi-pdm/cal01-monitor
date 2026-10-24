import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowLeft, Maximize2, RotateCcw, X } from "lucide-react";
import { clampDrawerSize, drawerLimits, resizeDrawer } from './drawer-size';
import type { DrawerLimits, DrawerSize, ResizeAxis } from './drawer-size';

export default function WorkspaceDrawer({ open, title, name, onClose, children, resizable = true, onWidthChange, onBack, backLabel = '이전 화면으로 돌아가기' }: {
  open: boolean; title: string; name: string; onClose: () => void; children: ReactNode;
  resizable?: boolean; onWidthChange?: (name: string, width: number) => void; onBack?: () => void; backLabel?: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [size, setSize] = useState<DrawerSize | null>(null);
  const limits = useRef<DrawerLimits>({ minWidth: 1, maxWidth: 2000, minHeight: 1, maxHeight: 2000 });
  const drag = useRef<{ id: number; x: number; y: number; size: DrawerSize; axis: ResizeAxis } | null>(null);
  function measure() {
    const node = panel.current, root = node?.closest<HTMLElement>('.immersive');
    if (!node || !root) return;
    const rect = node.getBoundingClientRect(), bounds = root.getBoundingClientRect();
    const navigation = root.querySelector('.zone-navigation')?.getBoundingClientRect();
    const bottom = navigation ? bounds.bottom - navigation.top + 10 : 40;
    limits.current = drawerLimits(bounds.width, bounds.height, rect.top - bounds.top, bounds.right - rect.right, bottom);
    return { width: rect.width, height: rect.height };
  }
  useLayoutEffect(() => {
    if (!open || !resizable) return;
    const sync = () => { const measured = measure(); if (measured) onWidthChange?.(name, measured.width); setSize(current => {
      if (!current) return current;
      const next = clampDrawerSize(current, limits.current);
      return next.width === current.width && next.height === current.height ? current : next;
    }); };
    const root = panel.current?.closest<HTMLElement>('.immersive');
    const observer = new ResizeObserver(sync);
    if (root) { observer.observe(root); const nav = root.querySelector('.zone-navigation'); if (nav) observer.observe(nav); }
    window.addEventListener('resize', sync); sync();
    return () => { observer.disconnect(); window.removeEventListener('resize', sync); drag.current = null; };
  }, [open, resizable, onWidthChange, name]);
  useLayoutEffect(() => {
    if (open && resizable && panel.current) onWidthChange?.(name, panel.current.getBoundingClientRect().width);
  }, [open, resizable, size, onWidthChange, name]);
  function startResize(event: ReactPointerEvent<HTMLButtonElement>, axis: ResizeAxis) {
    if (event.button !== 0) return;
    const current = measure(); if (!current) return;
    event.preventDefault(); event.stopPropagation();
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, size: current, axis };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = drag.current; if (!start || start.id !== event.pointerId) return;
    setSize(resizeDrawer(start.size, event.clientX - start.x, event.clientY - start.y, start.axis, limits.current));
  }
  function finishResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyResize(event: ReactKeyboardEvent<HTMLButtonElement>, axis: ResizeAxis) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Home') { setSize(null); return; }
    const current = measure(); if (!current) return;
    const step = event.shiftKey ? 60 : 24;
    setSize(resizeDrawer(current, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
      event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0, axis, limits.current));
  }
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement;
    panel.current?.focus();
    return () => {
      if (previousFocus.current?.isConnected && previousFocus.current.getClientRects().length) previousFocus.current.focus();
      else document.querySelector<HTMLButtonElement>('[aria-label="채널 그래프 열기"]')?.focus();
    };
  }, [open]);
  return <section ref={panel} className={`workspace-drawer drawer-${name}${resizable ? ' is-resizable' : ''}`} hidden={!open} data-resized={Boolean(size)}
    style={resizable && size ? { width: size.width, height: size.height, bottom: 'auto', left: 'auto' } : undefined}
    role="dialog" aria-modal="false" aria-label={title} tabIndex={-1}
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    }}>
    <header className="drawer-header"><div className="drawer-title">{onBack && <button className="drawer-back" onClick={onBack} aria-label={backLabel} title={backLabel}><ArrowLeft size={17} /><span>뒤로</span></button>}<div><span className="eyebrow">CAL01 / {name.toUpperCase()}</span><h2>{title}</h2></div></div>
      <div className="drawer-header-actions">{resizable && <button className="icon-button" onClick={() => setSize(null)} aria-label={`${title} 기본 크기로 복원`} title="기본 크기로 복원"><RotateCcw size={16} /></button>}
      <button className="icon-button" onClick={onClose} aria-label={`${title} 닫기`}><X size={19} /></button>
      </div>
    </header>
    <div className="drawer-scroll">{children}</div>
    {resizable && <>{(['width', 'height', 'both'] as const).map(axis => <button key={axis} type="button"
      className={`drawer-resize drawer-resize-${axis}`} aria-label={`${title} 창 ${axis === 'width' ? '너비' : axis === 'height' ? '높이' : '크기'} 조절`}
      title="끌어서 크기 조절 · 방향키 조절 · Home 기본 크기" onPointerDown={event => startResize(event, axis)} onPointerMove={moveResize}
      onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => { drag.current = null; }} onKeyDown={event => keyResize(event, axis)}>
      {axis === 'both' && <Maximize2 size={14} />}
    </button>)}</>}
  </section>;
}
