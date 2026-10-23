import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { api, queryString } from '../api'
import type { Dataset, Lot } from '../types'
import { dateTime } from '../time'

export default function HistorySearchDialog({ datasets, datasetId, onClose, onSelect }: {
  datasets: Dataset[]; datasetId: string; onClose: () => void; onSelect: (datasetId: string, lotNo: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [source, setSource] = useState(datasetId)
  const [search, setSearch] = useState('')
  const query = useQuery({ queryKey: ['lots', source], enabled: Boolean(source),
    queryFn: ({ signal }) => api<{ lots: Lot[] }>(`/api/lots?${queryString({ dataset: source })}`, { signal }) })
  const keyword = search.trim().toLocaleLowerCase()
  const lots = (query.data?.lots ?? []).filter(lot => `${lot.lot_no} ${lot.grade || '강종 미기록'}`.toLocaleLowerCase().includes(keyword))
  useEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector('input')?.focus() }, [])
  return <dialog ref={dialog} className="request-dialog history-search-dialog" aria-labelledby="history-search-heading"
    onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <header><h2 id="history-search-heading">과거 기록</h2><button className="icon-button" aria-label="기록 검색 닫기" onClick={onClose}><X size={20} /></button></header>
    <label className="history-search-source">자료<select aria-label="검색할 자료" value={source} onChange={event => setSource(event.target.value)}>{datasets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="history-search-input"><Search size={19} /><input autoFocus value={search} onChange={event => setSearch(event.target.value)} aria-label="과거 기록 검색" placeholder="LOT 번호 또는 강종" /></label>
    <p className="history-search-count">{keyword ? '검색 결과' : '등록된 기록'} {lots.length}건 · 원자료 시각 기준</p>
    {query.isPending && <p role="status">기록을 불러오는 중</p>}
    {query.error && <p role="alert">{query.error instanceof Error ? query.error.message : '기록을 불러오지 못했습니다.'}</p>}
    <div className="history-search-results">{lots.map(lot => <button key={lot.lot_no} onClick={() => onSelect(source, String(lot.lot_no))}>
      <strong>{lot.lot_no}</strong><span>{lot.grade || '강종 미기록'}</span><small>{dateTime(lot.start)} ~ {dateTime(lot.end)}</small>
    </button>)}{!query.isPending && !query.error && lots.length === 0 && <p>일치하는 기록 없음</p>}</div>
  </dialog>
}
