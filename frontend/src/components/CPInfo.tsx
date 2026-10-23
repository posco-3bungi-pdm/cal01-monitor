import { Info } from 'lucide-react'
import './CPInfo.css'

export default function CPInfo() {
  return <details className="cp-info">
    <summary aria-label="CP 설명 · Carbon Potential"><Info size={15} aria-hidden="true" />CP란?</summary>
    <div>
      <strong>Carbon Potential · 탄소 포텐셜</strong>
      <p>노 안의 가스 분위기가 가열된 강재 표면에 탄소를 공급하는 성향을 나타냅니다. 온도와 가스 조성에 따라 달라지며, 강재와 분위기의 균형에 따라 침탄·탈탄이 일어날 수 있습니다.</p>
      <p>온도(TC)·제어출력(OP)과 다른 계측이므로 알림도 따로 확인합니다. 같은 설비 구간이어서 Z4 공정의 붉은 강조는 함께 표시됩니다.</p>
      <dl><dt>CP-Z4</dt><dd>이 화면에서는 무차원 값으로 표시합니다.</dd><dt>CP-Z4M</dt><dd>회색 e⁻¹⁰은 ×10⁻¹⁰을 뜻합니다. 예: 1.146 e⁻¹⁰ = 0.0000000001146.</dd></dl>
      <p>현재 값만으로 강재의 탄소 함량이나 적정 운전 범위를 판단하지 않습니다. 두 채널의 환산식과 관리 기준은 현장 계측 정의를 따릅니다.</p>
      <a href="https://www.eurotherm.com/?wpdmdl=28121" target="_blank" rel="noreferrer">Eurotherm · Carbon Potential 기술 안내 ↗</a>
    </div>
  </details>
}
