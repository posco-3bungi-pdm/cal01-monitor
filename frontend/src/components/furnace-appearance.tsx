import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { FurnaceZone } from './furnace-model'

export type FurnaceAppearance = 'hologram' | 'realistic'

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

const HOLOGRAM_VERTEX = /* glsl */`
  varying vec3 vWorldPosition;
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
    vec4 worldPosition = modelMatrix * localPosition;
    vec4 viewPosition = viewMatrix * worldPosition;
    vWorldPosition = worldPosition.xyz;
    vViewNormal = normalize(normalMatrix * localNormal);
    vViewDirection = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`
const HOLOGRAM_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vWorldPosition;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;
  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vViewNormal), normalize(vViewDirection))), 1.7);
    float phase = vWorldPosition.y * 13.0;
    float edge = max(fwidth(phase), 0.015);
    float scan = 1.0 - smoothstep(0.045, 0.045 + edge, abs(fract(phase) - 0.5));
    float alpha = uOpacity * (0.18 + fresnel * 0.70 + scan * 0.12);
    gl_FragColor = vec4(uColor * (0.83 + fresnel * 0.17), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function HologramMaterial({ color = '#6fdce8', opacity = 0.48 }: {
  color?: THREE.ColorRepresentation
  opacity?: number
}) {
  const { invalidate } = useThree()
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: THREE.MathUtils.clamp(opacity, 0, 1) },
  }), [])
  useEffect(() => {
    uniforms.uColor.value.set(color)
    uniforms.uOpacity.value = THREE.MathUtils.clamp(opacity, 0, 1)
    invalidate()
  }, [color, opacity, uniforms, invalidate])
  return <shaderMaterial vertexShader={HOLOGRAM_VERTEX} fragmentShader={HOLOGRAM_FRAGMENT}
    uniforms={uniforms} transparent depthWrite={false} depthTest
    side={THREE.DoubleSide} forceSinglePass toneMapped={false} />
}

const HEAT_VERTEX = /* glsl */`
  uniform float uTime;
  uniform float uHeat;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 point = position;
    float rise = sin(uv.y * 11.0 - uTime * 1.5 + uv.x * 7.0);
    point.x += rise * uHeat * 0.045 * sin(uv.y * 3.14159265);
    point.z += sin(uv.x * 10.0 + uv.y * 7.0 - uTime) * uHeat * 0.025;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
  }
`
const HEAT_FRAGMENT = /* glsl */`
  uniform float uTime;
  uniform float uHeat;
  varying vec2 vUv;
  void main() {
    float edge = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
    float height = smoothstep(0.0, 0.10, vUv.y) * (1.0 - smoothstep(0.42, 1.0, vUv.y));
    float warp = sin(vUv.y * 7.0 - uTime * 0.65) * 0.35 + sin(vUv.x * 9.0 + uTime * 0.4) * 0.15;
    float ripple = pow(0.5 + 0.5 * sin(vUv.x * 33.0 + vUv.y * 8.0 + warp - uTime * 0.85), 10.0);
    float alpha = edge * height * uHeat * (0.022 + ripple * 0.13);
    if (alpha < 0.003) discard;
    vec3 tint = mix(vec3(0.79, 0.85, 0.87), vec3(1.0, 0.72, 0.42), uHeat);
    gl_FragColor = vec4(tint, alpha);
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
  const { invalidate } = useThree()
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(() => ({ uTime: { value: 0.7 }, uHeat: { value: 0 } }), [])
  useEffect(() => {
    uniforms.uHeat.value = level
    invalidate()
  }, [level, animate, interior, invalidate, uniforms])
  useFrame((_, delta) => {
    if (!animate || level === 0 || !material.current) return
    uniforms.uTime.value = (uniforms.uTime.value + Math.min(delta, 0.05)) % 1200
    invalidate()
  })
  if (level === 0) return null
  const height = interior ? Math.min(3.8, zone.height * 0.56) : 0.85 + level * 1.15
  const position: [number, number, number] = interior
    ? [zone.x, zone.height * 0.57, zone.depth / 2 + 0.12]
    : [zone.x, zone.height + height / 2 + 0.12, 0]
  return <mesh position={position} raycast={ignoreRaycast} name={`ILLUSTRATIVE_HEAT_${zone.id}`}
    userData={{ illustrative: true, temperature, alarm: false }} renderOrder={5}>
    <planeGeometry args={[zone.width * 0.88, height, 12, 18]} />
    <shaderMaterial ref={material} vertexShader={HEAT_VERTEX} fragmentShader={HEAT_FRAGMENT}
      uniforms={uniforms} transparent depthWrite={false} depthTest
      side={THREE.DoubleSide} forceSinglePass toneMapped={false} />
  </mesh>
}
