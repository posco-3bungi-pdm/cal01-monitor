import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";

export default function FullscreenButton({ onError }: { onError: (message: string) => void }) {
  const [active, setActive] = useState(() => !!document.fullscreenElement);
  const [pending, setPending] = useState(false);
  const supported = document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function";
  const label = active ? "전체 화면 종료" : "전체 화면";

  useEffect(() => {
    const update = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      onError("전체 화면을 전환하지 못했어요. 브라우저의 전체 화면 설정을 확인해 주세요.");
    } finally { setPending(false); }
  }

  return <button type="button" className="icon-button fullscreen-toggle" disabled={!supported || pending}
    aria-label={label} aria-pressed={active} title={supported ? label + (active ? " · Esc로 종료" : "으로 보기") : "이 환경에서는 전체 화면을 사용할 수 없어요."}
    onClick={() => void toggle()}>{active ? <Minimize size={18} /> : <Maximize size={18} />}</button>;
}
