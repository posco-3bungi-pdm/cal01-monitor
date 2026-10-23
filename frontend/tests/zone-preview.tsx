import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import FurnaceScene from '../src/components/FurnaceScene'
import { summarizeZoneAttention } from '../src/components/zone-attention'
import type { Channel } from '../src/types'
import '../src/App.css'

// Isolated visual fixture. No requests, saved detections, or team notifications.
const ids = ['CLN-IN', ...Array.from({ length: 9 }, (_, i) => `TC-Z${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `OP-Z${i + 1}`), 'CP-Z4', 'CP-Z4M', 'TC-OUT1', 'TC-OUT2']
const channels: Channel[] = ids.map(id => ({ id, label: id, zone: id === 'CLN-IN' ? 'CLN' : id.split('-')[1].replace('M', ''),
  unit: id.startsWith('OP-') ? '%' : id.startsWith('CP-') ? null : '°C', kind: id.startsWith('OP-') ? 'output' : id.startsWith('CP-') ? 'process' : 'temperature' }))
function Preview() {
  const [scenario, setScenario] = useState('normal')
  const [selected, setSelected] = useState('')
  const [appearance, setAppearance] = useState<'hologram' | 'realistic'>('hologram')
  const [interior, setInterior] = useState(false)
  const candidates = scenario === 'normal' ? [] : [
    { zone_id: 'Z3', acknowledged: scenario === 'acknowledged' },
    { zone_id: 'Z3', acknowledged: scenario === 'acknowledged' },
    ...(scenario === 'multiple' ? [{ zone_id: 'Z4', acknowledged: false }, { zone_id: 'OUT1', acknowledged: false }] : []),
  ]
  const attention = summarizeZoneAttention(candidates)
  return <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#07151e' }}>
    <header style={{ padding: '17px 22px', background: '#12212a', borderBottom: '1px solid #31464f', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
      <div style={{ marginRight: 'auto' }}><strong style={{ fontSize: 18 }}>CAL01 · 구역 표시 미리보기</strong><p style={{ fontSize: 12, color: '#b9c7ca', marginTop: 5 }}>예시 상태 · 실제 이상 판정이나 알림·점검 기록을 생성하지 않습니다.</p></div>
      {([['normal', '평소'], ['pending', 'Z3 확인 필요'], ['acknowledged', '확인 후'], ['multiple', '여러 구역']] as const).map(([value, label]) =>
        <button key={value} aria-pressed={scenario === value} onClick={() => setScenario(value)} style={{ padding: '10px 13px', borderRadius: 10, background: scenario === value ? '#c9ee78' : '#263b45', color: scenario === value ? '#18230b' : '#e8f1f3' }}>{label}</button>)}
      <button onClick={() => setAppearance(appearance === 'hologram' ? 'realistic' : 'hologram')} style={{ color: '#c4d5dc' }}>표현: {appearance === 'hologram' ? '홀로그램' : '금속'}</button>
      <button onClick={() => setInterior(!interior)} style={{ color: '#c4d5dc' }}>내부 보기 {interior ? '켜짐' : '꺼짐'}</button>
    </header>
    <div style={{ flex: 1, minHeight: 0 }}>
      <FurnaceScene channels={channels} selectedChannel={selected} onSelectChannel={setSelected}
        values={{}} placements={[]} showInterior={interior} theme="dark" appearance={appearance}
        alertZoneIds={Object.keys(attention)} zoneAttention={attention} showLabels={false} />
    </div>
  </div>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Preview />)
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())
