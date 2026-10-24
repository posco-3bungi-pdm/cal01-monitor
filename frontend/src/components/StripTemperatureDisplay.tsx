import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Info } from 'lucide-react'
import { FURNACE_ZONES } from './furnace-model'
import { MISSING_STRIP_TEMPERATURE_COLOR, STRIP_TEMPERATURE_STOPS, stripTemperatureBands } from './strip-temperature'

const BAND_CENTRES = stripTemperatureBands(FURNACE_ZONES, {}).map(band => band.x)
const BAND_BOUNDARIES = BAND_CENTRES.slice(1).map((x, index) => (BAND_CENTRES[index] + x) / 2)

// Evaluate the zone at each surface pixel. Vertex interpolation would blend the
// long entry/exit spans across multiple zones that have no intermediate vertices.
export function StripTemperatureMaterial({ values }: { values: Record<string, number | null> }) {
  const { invalidate } = useThree()
  const bands = useMemo(() => stripTemperatureBands(FURNACE_ZONES, values), [values])
  const uniforms = useMemo(() => ({
    uStripColors: { value: BAND_CENTRES.map(() => new THREE.Color(MISSING_STRIP_TEMPERATURE_COLOR)) },
    uStripBoundaries: { value: BAND_BOUNDARIES },
  }), [])
  useEffect(() => {
    bands.forEach((band, index) => uniforms.uStripColors.value[index].set(band.color))
    invalidate()
  }, [bands, uniforms, invalidate])
  const compile = useMemo(() => (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vStripX;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStripX = position.x;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vStripX;
        uniform vec3 uStripColors[${BAND_CENTRES.length}];
        uniform float uStripBoundaries[${BAND_BOUNDARIES.length}];`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 stripColor = uStripColors[0];
        for (int i = 1; i < ${BAND_CENTRES.length}; i++) {
          stripColor = mix(stripColor, uStripColors[i], step(uStripBoundaries[i - 1], vStripX));
        }
        diffuseColor.rgb = stripColor;`)
  }, [uniforms])
  // A flat teaching overlay stays legible under either scene lighting preset.
  return <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} toneMapped={false}
    onBeforeCompile={compile} customProgramCacheKey={() => 'cal01-strip-temperature-v1'} />
}

export function StripTemperatureLegend() {
  const stops = STRIP_TEMPERATURE_STOPS
  const gradient = `linear-gradient(90deg, ${stops.map(stop => `${stop.color} ${stop.value / 10}%`).join(', ')})`
  return <aside className="strip-temperature-legend" aria-label="코일 온도 색상 범례" data-scene-ui>
    <div className="strip-temperature-heading"><span>코일 온도 <small>°C</small></span>
      <div className="strip-temperature-help"><button type="button" aria-label="온도 색상 설명" aria-describedby="strip-temperature-scale-help"><Info size={14} /></button>
        <div id="strip-temperature-scale-help" className="strip-temperature-help-text" role="tooltip">구역 TC에 따른 설명용 색상입니다. 실제 표면색·경보 등급을 뜻하지 않습니다.<br />0~1000°C 고정 범위이며, 범위 밖은 양끝 색으로 표시합니다. 회색은 관측 없음입니다. OUT은 출측 1·2를 나눠 표시합니다.</div>
      </div>
    </div>
    <div className="strip-temperature-scale" style={{ background: gradient }} aria-label="낮은 온도는 파랑, 높은 온도는 빨강" role="img" />
    <div className="strip-temperature-ticks"><span>0</span><span>500</span><span>1000</span></div>
  </aside>
}
