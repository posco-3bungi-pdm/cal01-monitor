import { Check, ChevronDown } from 'lucide-react'
import type { Channel } from '../types'

export default function ChannelSelectionPanel({ channels, visibleIds, selectedChannel, live, onGroup, onToggle }: {
  channels: Channel[]; visibleIds: string[]; selectedChannel: string; live: boolean;
  onGroup: (group: 'all' | 'TC' | 'OP' | 'selected') => void; onToggle: (id: string) => void;
}) {
  const count = visibleIds.filter(id => channels.some(item => item.id === id)).length
  const content = <section className="panel channel-selection-panel" aria-labelledby="channel-heading">
    <div className="channel-controls-heading"><div><h2 id="channel-heading">표시할 채널</h2><span className="muted">{count} / {channels.length}개 선택</span></div>
      <div className="segmented-control" aria-label="채널 빠른 선택">
        {(['all', 'TC', 'OP', 'selected'] as const).map(group => <button key={group} onClick={() => onGroup(group)}
          aria-pressed={group === 'all' ? channels.length > 0 && visibleIds.length === channels.length : group === 'selected' ? visibleIds.length === 1 && visibleIds[0] === selectedChannel : visibleIds.length > 0 && visibleIds.every(id => id.startsWith(`${group}-`))}>
          {({ all: '전체', TC: 'TC', OP: 'OP', selected: '선택한 채널만' })[group]}</button>)}
      </div>
    </div>
    <div className="channel-chips">{channels.map(item => <button key={item.id} className={`channel-chip ${visibleIds.includes(item.id) ? 'is-on' : ''} ${selectedChannel === item.id ? 'is-focused' : ''}`}
      aria-pressed={visibleIds.includes(item.id)} aria-label={`${item.id} 그래프 ${visibleIds.includes(item.id) ? '숨기기' : '표시'}`} onClick={() => onToggle(item.id)}><span>{visibleIds.includes(item.id) ? <Check size={11} /> : null}</span>{item.id}</button>)}</div>
  </section>
  return live ? <details className="live-channel-options"><summary>표시 채널 <span>{count}개</span><span>변경<ChevronDown size={14} /></span></summary>{content}</details> : content
}
