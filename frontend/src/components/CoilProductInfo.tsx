import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, LoaderCircle, X } from 'lucide-react'
import { api, queryString } from '../api'
import type { Lot, MaterialGrade } from '../types'

export default function CoilProductInfo({ datasetId, lot, disabled, onOpen, readOnly = false }: {
  datasetId: string; lot: Lot; disabled: boolean; onOpen: () => void; readOnly?: boolean
}) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(lot.grade)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const sourceGrade = lot.source_grade ?? (lot.grade_source !== 'linked' ? lot.grade : '')
  const catalog = useQuery({ queryKey: ['material-grades'], queryFn: ({ signal }) => api<{ grades: MaterialGrade[] }>('/api/material-grades', { signal }), enabled: open && !sourceGrade && !readOnly, staleTime: 300_000 })
  const preview = sourceGrade ? lot.product : draft ? catalog.data?.grades.find(item => item.grade === draft) ?? (draft === lot.grade ? lot.product : null) : null
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!pending && event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending) setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [open, pending])
  async function save() {
    if (readOnly || pending || disabled || draft === lot.grade) return
    setPending(true); setError('')
    try {
      await api(`/api/lot-grade-link?${queryString({ dataset: datasetId, lot: lot.lot_no })}`, { method: 'PATCH', body: JSON.stringify({ grade: draft, revision: lot.material_revision ?? 0 }) })
      await client.invalidateQueries({ queryKey: ['lots', datasetId] })
      setOpen(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '강종을 연결하지 못했습니다.')
      await client.invalidateQueries({ queryKey: ['lots', datasetId] })
    } finally { setPending(false) }
  }
  return <div className="coil-product-info" ref={root}>
    <div className="coil-product-summary" aria-label="조회 코일 제품 정보">
      {lot.product ? <><span className="coil-product-family">{lot.product.family}</span><span>{lot.product.characteristics}</span></> : <span>{lot.grade ? '제품 기준 미등록' : '제품 정보 미연결'}</span>}
      {lot.grade_source === 'linked' && <small title="원자료와 별도로 담당자가 연결한 강종">담당자 연결</small>}
      <button type="button" className="text-button coil-product-trigger" aria-expanded={open} aria-label={lot.grade ? '제품 특성과 연결 정보' : readOnly ? '조회 LOT 제품 정보' : '조회 LOT 강종 연결'} disabled={disabled} onClick={() => { const next = !open; if (next) { onOpen(); setDraft(lot.grade); setError('') } setOpen(next) }}>{lot.grade || readOnly ? <Info size={14} /> : '강종 연결'}</button>
    </div>
    {open && <section className="coil-product-popover" aria-label="코일 제품 정보와 강종 연결">
      <header><strong>LOT {lot.lot_no} · 제품 정보</strong><button className="icon-button" aria-label="제품 정보 닫기" disabled={pending} onClick={() => setOpen(false)}><X size={16} /></button></header>
      {!sourceGrade && !readOnly && <><p>원자료에 강종이 없습니다. 제품 라벨·작업 지시서로 확인한 강종을 연결하십시오.</p><label>실제 강종<select aria-label="연결할 강종" value={draft} onChange={event => setDraft(event.target.value)} disabled={pending || catalog.isPending}><option value="">미연결</option>{catalog.data?.grades.map(item => <option key={item.grade} value={item.grade}>{item.grade} · {item.family}</option>)}</select></label></>}
      {preview && <div className="coil-product-reference"><span className="grade-label"><i style={{ backgroundColor: preview.color }} />{preview.grade}</span><strong>{preview.family} · {preview.characteristics}</strong><p>{preview.description}</p>{preview.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</div>}
      <small>{sourceGrade ? '원자료 강종에서 자동 연결' : lot.grade_source === 'linked' ? '담당자가 연결한 강종 · 원자료와 별도 보관' : readOnly ? '제품 정보 미연결' : '강종을 연결하면 제품군·특성과 색상을 자동 표시'}<br />제품군의 일반 설명이며 해당 코일의 성적서·열처리 조건은 별도 확인한다.</small>
      {(error || catalog.error) && <p className="form-error" role="alert">{error || '강종 기준을 불러오지 못했습니다.'}</p>}
      {!sourceGrade && !readOnly && <button className="primary-button compact" disabled={pending || catalog.isPending || draft === lot.grade} onClick={() => void save()}>{pending && <LoaderCircle size={14} className="spin" />}이 LOT에 연결</button>}
    </section>}
  </div>
}
