import { useEffect, useRef, useState } from "react";
import { FileUp, LoaderCircle, X } from "lucide-react";
import { api } from "../api";
import type { Dataset } from "../types";

export default function CsvImportDialog({ onClose, onImported }: {
  onClose: () => void; onImported: (dataset: Dataset, reused: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || pending) return;
    setError(""); setPending(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("name", file.name.replace(/\.csv$/i, ""));
      const result = await api<{ dataset: Dataset; reused: boolean }>("/api/datasets/import", { method: "POST", body });
      onImported(result.dataset, result.reused);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV를 등록하지 못했습니다.");
    } finally { setPending(false); }
  }
  return <dialog ref={dialog} className="request-dialog csv-import-dialog" aria-labelledby="csv-import-heading"
    onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <form onSubmit={submit}>
      <header><h2 id="csv-import-heading">온도 CSV 불러오기</h2><button type="button" className="icon-button" onClick={onClose} disabled={pending} aria-label="CSV 불러오기 닫기"><X size={19} /></button></header>
      <label className="csv-file-choice"><FileUp size={32} /><span>{file?.name ?? "온도.csv 또는 cal01_base.csv 선택"}</span>
        <input type="file" accept=".csv,text/csv" disabled={pending} onChange={event => {
          setFile(event.target.files?.[0] ?? null); setError("");
        }} />
      </label>
      <p className="dialog-note">파일의 LOT와 기록 시각으로 재생합니다. 기존 자료와 판단은 그대로 두고, 같은 파일은 다시 등록하지 않습니다.</p>
      <p className="dialog-note">MEAS_DT · LOT_NO · 채널값이 필요합니다. 최대 512MB, 50만 행.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {pending && <p role="status"><LoaderCircle size={16} className="spin" /> 파일을 검사하고 저장하는 중… 큰 파일은 잠시 걸립니다.</p>}
      <footer><button type="submit" className="primary-button" disabled={!file || pending}>{pending ? "등록 중" : "불러오기"}</button></footer>
    </form>
  </dialog>;
}
