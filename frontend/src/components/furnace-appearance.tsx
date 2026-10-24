import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { FurnaceZone } from './furnace-model'

export type FurnaceAppearance = 'hologram' | 'realistic'
export const HologramThemeContext = createContext<'light' | 'dark'>('dark')
// A selection changes only the existing part surfaces, never the plant geometry.
export const PartSelectionContext = createContext(false)
export const PartFocusContext = createContext(false)
export const PartXrayContext = createContext(false)

const finiteValue = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export function temperatureForZone(zoneId: string, values: Record<string, number | null>): number | null {
  if (zoneId === 'CLN' || zoneId === 'CLN-IN') return finiteValue(values['CLN-IN'])
  if (zoneId === 'OUT') {
    const first = finiteValue(values['TC-OUT1'])
    const second = finiteValue(values['TC-OUT2'])
    if (first === null) return second
    if (second === null) return first
    return first / 2 + second / 2
  }
  if (zoneId === 'OUT1' || zoneId === 'OUT2') return finiteValue(values[`TC-${zoneId}`])
  return /^Z[1-9]\d*$/.test(zoneId) ? finiteValue(values[`TC-${zoneId}`]) : null
}

// A descriptive visual scale, not an alarm limit or a thermal simulation.
// Unit follows the project's TC/CLN temperature convention.
export function heatLevel(temperature: number | null): number {
  return temperature === null || !Number.isFinite(temperature)
    ? 0 : THREE.MathUtils.clamp((temperature - 150) / 800, 0, 1)
}

type SurfaceTextures = {
  color: THREE.DataTexture
  surface: THREE.DataTexture
  users: number
}
let sharedSurface: SurfaceTextures | null = null

function grain(x: number, y: number, seed: number) {
  let n = Math.imul(x + seed, 374761393) + Math.imul(y + seed * 7, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

function noise(u: number, v: number, columns: number, rows: number, seed: number) {
  const x = u * columns, y = v * rows
  const ix = Math.floor(x), iy = Math.floor(y)
  const sx = x - ix, sy = y - iy
  const tx = sx * sx * (3 - 2 * sx), ty = sy * sy * (3 - 2 * sy)
  const sample = (dx: number, dy: number) => grain((ix + dx) % columns, (iy + dy) % rows, seed)
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(sample(0, 0), sample(1, 0), tx),
    THREE.MathUtils.lerp(sample(0, 1), sample(1, 1), tx), ty)
}

function createSurface(): SurfaceTextures {
  const size = 256
  const colorBytes = new Uint8Array(size * size * 4)
  const surfaceBytes = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size
    const broad = noise(u, v, 5, 5, 17) * 0.62 + noise(u, v, 13, 9, 47) * 0.38
    const oil = THREE.MathUtils.smoothstep(broad, 0.55, 0.82)
    const streak = THREE.MathUtils.smoothstep(noise(u, v, 64, 2, 73), 0.60, 0.9)
    const fine = grain(x, y, 101)
    const brushed = Math.sin(v * size * 2.399963) * 0.004
    // Keep wide discoloration faint; narrow vertical oil marks carry the wear.
    const stain = Math.min(0.34, oil * 0.18 + streak * 0.20)
    const i = (y * size + x) * 4
    colorBytes[i] = Math.round(244 - stain * 143 + (fine - 0.5) * 9)
    colorBytes[i + 1] = Math.round(243 - stain * 153 + (fine - 0.5) * 8)
    colorBytes[i + 2] = Math.round(237 - stain * 158 + (fine - 0.5) * 7)
    colorBytes[i + 3] = 255
    // MeshStandardMaterial reads bump from red and roughness from green.
    surfaceBytes[i] = Math.round(128 + (fine - 0.5) * 15 + oil * 4 + brushed * 255)
    surfaceBytes[i + 1] = Math.round(175 + stain * 100 + fine * 17)
    surfaceBytes[i + 2] = 255
    surfaceBytes[i + 3] = 255
  }
  const color = new THREE.DataTexture(colorBytes, size, size, THREE.RGBAFormat)
  const surface = new THREE.DataTexture(surfaceBytes, size, size, THREE.RGBAFormat)
  color.colorSpace = THREE.SRGBColorSpace
  surface.colorSpace = THREE.NoColorSpace
  for (const texture of [color, surface]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 2
    texture.needsUpdate = true
  }
  return { color, surface, users: 0 }
}

function retainSurface() {
  const surface = sharedSurface ??= createSurface()
  surface.users++
  return surface
}

function releaseSurface(surface: SurfaceTextures) {
  surface.users--
  // StrictMode immediately reconnects effects. Release only if no material
  // has reattached after that cycle; abandoned renders allocate no textures.
  queueMicrotask(() => {
    if (surface.users !== 0 || sharedSurface !== surface) return
    surface.color.dispose()
    surface.surface.dispose()
    sharedSurface = null
  })
}

export function IndustrialMaterial({ color = '#a4afb4', emissive = '#000000', emissiveIntensity = 0 }: {
  color?: THREE.ColorRepresentation
  emissive?: THREE.ColorRepresentation
  emissiveIntensity?: number
}) {
  const [textures, setTextures] = useState<SurfaceTextures | null>(null)
  useEffect(() => {
    const surface = retainSurface()
    setTextures(surface)
    return () => releaseSurface(surface)
  }, [])
  return <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity}
    map={textures?.color ?? null} roughnessMap={textures?.surface ?? null}
    bumpMap={textures?.surface ?? null} bumpScale={0.025}
    metalness={0.62} roughness={0.85} />
}

// Pixel-width UV contours retain instancing and add no geometry or draw calls.
// Flat panel edges stay sharp; curved surfaces use sparse, quieter section lines.
const HOLOGRAM_VERTEX = /* glsl */`
  varying vec2 vPanelUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;
  void main() {
    vec4 localPosition = vec4(position, 1.0);
    vec3 localNormal = normal;
    #ifdef USE_INSTANCING
      mat3 instanceBasis = mat3(instanceMatrix);
      localNormal /= max(vec3(dot(instanceBasis[0], instanceBasis[0]),
        dot(instanceBasis[1], instanceBasis[1]), dot(instanceBasis[2], instanceBasis[2])), vec3(0.000001));
      localNormal = instanceBasis * localNormal;
      localPosition = instanceMatrix * localPosition;
    #endif
    vec4 viewPosition = viewMatrix * modelMatrix * localPosition;
    vPanelUv = uv;
    vViewNormal = normalize(normalMatrix * localNormal);
    vViewDirection = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`
const HOLOGRAM_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uEmphasis;
  uniform float uSelection;
  varying vec2 vPanelUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;
  void main() {
    vec2 pixelWidth = max(fwidth(vPanelUv), vec2(0.00001));
    vec2 borderDistance = min(vPanelUv, 1.0 - vPanelUv) / pixelWidth;
    float hasUv = step(0.000001, max(fwidth(vPanelUv.x), fwidth(vPanelUv.y)));
    float border = (1.0 - smoothstep(0.35, 1.0, min(borderDistance.x, borderDistance.y))) * hasUv;
    vec3 viewNormal = normalize(vViewNormal);
    float curved = smoothstep(0.0003, 0.003, length(fwidth(viewNormal)));
    vec2 sections = vPanelUv * vec2(8.0, 4.0);
    vec2 sectionDistance = abs(fract(sections - 0.5) - 0.5) / max(fwidth(sections), vec2(0.00001));
    float sectionLine = (1.0 - smoothstep(0.3, 0.85, min(sectionDistance.x, sectionDistance.y))) * curved * hasUv;
    float rim = pow(1.0 - abs(dot(viewNormal, normalize(vViewDirection))), 8.0);
    float contour = max(border, sectionLine * 0.28);
    float frontBack = gl_FrontFacing ? 1.0 : mix(0.28, 0.42, uSelection);
    float depthFade = 0.62 + 0.38 * exp(-length(vViewDirection) * 0.018);
    float fill = mix(mix(0.018, 0.50, uSelection), 0.18, uEmphasis);
    float edgeStrength = mix(1.30, 1.65, max(uEmphasis, uSelection));
    float alpha = uOpacity * (fill + contour * edgeStrength + rim * mix(0.11, 0.40, uSelection)) * frontBack * depthFade;
    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.92));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function HologramMaterial({ color = '#6fdce8', opacity = 0.48, emphasis = false, selected = false, xray = false }: {
  color?: THREE.ColorRepresentation
  opacity?: number
  emphasis?: boolean
  selected?: boolean
  xray?: boolean
}) {
  const { invalidate } = useThree()
  const theme = useContext(HologramThemeContext)
  const selectedPart = useContext(PartSelectionContext)
  const partFocus = useContext(PartFocusContext)
  const partXray = useContext(PartXrayContext)
  // A red warning always wins over cyan selection. No bloom or second draw pass.
  const selection = !emphasis && (selected || selectedPart)
  const palette = theme === 'light'
    ? (emphasis ? '#c83c32' : selection ? '#006c82' : '#07596b')
    : selection ? '#75efff' : color
  const surfaceOpacity = selection ? Math.max(opacity, 0.95) : partFocus && !emphasis ? opacity * 0.22 : opacity
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(palette) },
    uOpacity: { value: THREE.MathUtils.clamp(surfaceOpacity, 0, 1) },
    uEmphasis: { value: emphasis ? 1 : 0 },
    uSelection: { value: selection ? 1 : 0 },
  }), [])
  useEffect(() => {
    uniforms.uColor.value.set(palette)
    uniforms.uOpacity.value = THREE.MathUtils.clamp(surfaceOpacity, 0, 1)
    uniforms.uEmphasis.value = emphasis ? 1 : 0
    uniforms.uSelection.value = selection ? 1 : 0
    invalidate()
  }, [palette, surfaceOpacity, emphasis, selection, uniforms, invalidate])
  return <shaderMaterial vertexShader={HOLOGRAM_VERTEX} fragmentShader={HOLOGRAM_FRAGMENT}
    uniforms={uniforms} transparent depthWrite={false} depthTest={!(xray || partXray)}
    side={THREE.DoubleSide} forceSinglePass toneMapped={false}
    blending={selection && theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending} />
}

const HazeBuffer = createContext<{ texture: THREE.Texture; viewport: THREE.Vector2 } | null>(null)

// One low-resolution capture is shared by every local plume. No full-screen
// postprocess and no separate scene capture per furnace zone.
export function HeatHazeLayer({ active, children }: { active: boolean; children: ReactNode }) {
  const { gl, size, invalidate } = useThree()
  const group = useRef<THREE.Group>(null)
  const lastCapture = useRef(-Infinity)
  const lastCamera = useRef(new THREE.Matrix4())
  const target = useMemo(() => {
    const buffer = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true })
    buffer.texture.colorSpace = THREE.LinearSRGBColorSpace
    return buffer
  }, [])
  const viewport = useMemo(() => new THREE.Vector2(), [])
  const context = useMemo(() => ({ texture: target.texture, viewport }), [target, viewport])
  useEffect(() => {
    gl.getDrawingBufferSize(viewport)
    const ratio = Math.min(0.5, 1024 / Math.max(viewport.x, viewport.y))
    target.setSize(Math.max(1, Math.round(viewport.x * ratio)), Math.max(1, Math.round(viewport.y * ratio)))
    lastCapture.current = -Infinity
    invalidate()
  }, [gl, size, target, viewport, invalidate])
  useEffect(() => () => target.dispose(), [target])
  useFrame(({ scene, camera, clock }) => {
    if (!group.current || group.current.children.length === 0) return
    const moved = !lastCamera.current.equals(camera.matrixWorld)
    if (active && !moved && clock.elapsedTime - lastCapture.current < 1 / 24) return
    const previousTarget = gl.getRenderTarget()
    const previousToneMapping = gl.toneMapping
    const previousShadowUpdate = gl.shadowMap.autoUpdate
    const previousShadowNeedsUpdate = gl.shadowMap.needsUpdate
    const previousVisible = group.current.visible
    try {
      group.current.visible = false
      gl.shadowMap.autoUpdate = false
      gl.shadowMap.needsUpdate = false
      gl.toneMapping = THREE.NoToneMapping
      gl.setRenderTarget(target)
      gl.clear()
      gl.render(scene, camera)
      lastCapture.current = clock.elapsedTime
      lastCamera.current.copy(camera.matrixWorld)
    } finally {
      group.current.visible = previousVisible
      gl.toneMapping = previousToneMapping
      gl.shadowMap.autoUpdate = previousShadowUpdate
      gl.shadowMap.needsUpdate = previousShadowNeedsUpdate
      gl.setRenderTarget(previousTarget)
    }
  })
  return <HazeBuffer.Provider value={context}><group ref={group}>{children}</group></HazeBuffer.Provider>
}

const HEAT_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const HEAT_FRAGMENT = /* glsl */`
  uniform sampler2D uBackground;
  uniform vec2 uViewport;
  uniform float uTime;
  uniform float uHeat;
  varying vec2 vUv;
  void main() {
    float edge = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
    float height = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float envelope = edge * height;
    if (envelope < 0.005) discard;
    vec2 flow = vec2(
      sin(vUv.y * 24.0 - uTime * 2.1 + sin(vUv.x * 17.0 + uTime) * 1.8),
      sin(vUv.x * 23.0 + vUv.y * 13.0 - uTime * 1.6)
    );
    vec2 screenUv = gl_FragCoord.xy / uViewport;
    vec2 offset = flow * envelope * uHeat * vec2(4.0, 2.3) / uViewport;
    vec3 background = texture2D(uBackground, clamp(screenUv + offset, vec2(0.001), vec2(0.999))).rgb;
    gl_FragColor = vec4(background, envelope * 0.85);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
const ignoreRaycast = () => {}

export function HeatHaze({ zone, temperature, animate, interior }: {
  zone: FurnaceZone
  temperature: number | null
  animate: boolean
  interior: boolean
}) {
  const level = heatLevel(temperature)
  const buffer = useContext(HazeBuffer)
  const { invalidate } = useThree()
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(() => ({
    uTime: { value: 0.7 }, uHeat: { value: 0 },
    uBackground: { value: buffer?.texture ?? null },
    uViewport: { value: buffer?.viewport ?? new THREE.Vector2(1, 1) },
  }), [buffer])
  useEffect(() => {
    uniforms.uHeat.value = level
    invalidate()
  }, [level, animate, interior, invalidate, uniforms])
  useFrame((_, delta) => {
    if (!animate || level === 0 || !material.current) return
    uniforms.uTime.value = (uniforms.uTime.value + Math.min(delta, 0.05)) % 1200
    invalidate()
  })
  if (level === 0 || !buffer) return null
  const height = interior ? Math.min(3.8, zone.height * 0.56) : 0.85 + level * 1.15
  const position: [number, number, number] = interior
    ? [zone.x, zone.height * 0.57, zone.depth / 2 + 0.12]
    : [zone.x, zone.height + height / 2 + 0.12, 0]
  return <mesh position={position} raycast={ignoreRaycast} name={`ILLUSTRATIVE_HEAT_${zone.id}`}
    userData={{ illustrative: true, temperature, alarm: false }} renderOrder={5}>
    <planeGeometry args={[zone.width * 0.88, height, 12, 18]} />
    <shaderMaterial ref={material} vertexShader={HEAT_VERTEX} fragmentShader={HEAT_FRAGMENT}
      uniforms={uniforms} transparent depthWrite={false} depthTest
      side={THREE.DoubleSide} forceSinglePass toneMapped />
  </mesh>
}

export function illustrativeSurfaceAt(x: number) {
  const progress = THREE.MathUtils.smoothstep(x, -16.65, -14.45)
  const wet = THREE.MathUtils.smoothstep(x, -16.65, -16.1)
    * (1 - THREE.MathUtils.smoothstep(x, -14.05, -10.0))
  return { soil: 1 - progress, wetness: wet }
}

// A moving, neutral steel surface. The cleaning profile is a teaching example;
// neither grade nor CLN-IN is used to invent a measured surface condition.
export function SteelSurfaceMaterial({ simulationActive, motion, temperatureColors = false }: {
  simulationActive: boolean
  motion?: RefObject<number>
  temperatureColors?: boolean
}) {
  const { invalidate } = useThree()
  const uniforms = useMemo(() => ({
    uSteelTravel: { value: 0 }, uSurfaceColor: { value: temperatureColors ? 0 : 1 },
  }), [])
  useEffect(() => {
    uniforms.uSurfaceColor.value = temperatureColors ? 0 : 1
    invalidate()
  }, [temperatureColors, uniforms, invalidate])
  useFrame(() => {
    if (simulationActive && motion) uniforms.uSteelTravel.value = motion.current
  })
  const compile = useMemo(() => (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float stripDistance;
        varying vec3 vSteelPoint;
        varying float vSteelDistance;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSteelPoint = position;
        vSteelDistance = stripDistance;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSteelPoint;
        varying float vSteelDistance;
        uniform float uSteelTravel;
        uniform float uSurfaceColor;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float travel = vSteelDistance - uSteelTravel;
        float soil = 1.0 - smoothstep(-16.65, -14.45, vSteelPoint.x);
        float wetness = smoothstep(-16.65, -16.1, vSteelPoint.x)
          * (1.0 - smoothstep(-14.05, -10.0, vSteelPoint.x));
        float fineGrain = sin(vSteelPoint.z * 170.0 + sin(travel * 3.0)) * 0.012;
        float stain = smoothstep(0.2, 0.8, sin(travel * 2.8 + sin(vSteelPoint.z * 11.0))
          * sin(vSteelPoint.z * 9.0 + travel * 0.35));
        vec3 dirt = mix(vec3(1.0), vec3(0.48, 0.47, 0.43), soil * stain * 0.28);
        diffuseColor.rgb *= mix(vec3(1.0), dirt + fineGrain, uSurfaceColor);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + soil * 0.1 - wetness * 0.17, 0.12, 0.7);`)
  }, [uniforms])
  return <meshStandardMaterial color={temperatureColors ? '#ffffff' : '#b9c4ca'}
    metalness={0.84} roughness={0.36} vertexColors={temperatureColors}
    side={THREE.DoubleSide} onBeforeCompile={compile}
    customProgramCacheKey={() => 'cal01-steel-surface-v1'} />
}
