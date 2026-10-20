import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Theme } from '../types'

// A recognizable channel-location symbol at the existing saved placement.
// It does not identify this channel with any catalog part or verified mounting.
export function CpChannelProbe({ color, theme }: { color: string; theme: Theme }) {
  const nameplate = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 72
    const context = canvas.getContext('2d')!
    context.fillStyle = theme === 'dark' ? '#241c36' : '#f7f2ff'
    context.fillRect(0, 0, 256, 72)
    context.fillStyle = theme === 'dark' ? '#e9d5ff' : '#4b276b'
    context.font = 'bold 38px Consolas, monospace'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('CP-Z4', 128, 38)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [theme])
  useEffect(() => () => nameplate.dispose(), [nameplate])
  return <group name="CP_Z4_CHANNEL_LOCATION_SYMBOL"
    userData={{ channel_id: 'CP-Z4', representative_symbol: true, catalog_part: null }}>
    <mesh position={[0, 0, -0.12]} castShadow>
      <boxGeometry args={[0.57, 0.56, 0.07]} />
      <meshStandardMaterial color="#7c8d95" metalness={0.78} roughness={0.3} />
    </mesh>
    <mesh position={[0, 0, -0.48]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[0.085, 0.085, 0.72, 14]} />
      <meshStandardMaterial color="#c1c9cb" metalness={0.85} roughness={0.22} />
    </mesh>
    <mesh position={[0, 0, -0.9]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 0.24, 12]} />
      <meshStandardMaterial color="#707f82" metalness={0.65} roughness={0.35} />
    </mesh>
    <mesh position={[0, 0, 0.11]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[0.27, 0.27, 0.39, 20]} />
      <meshStandardMaterial color={color} metalness={0.5} roughness={0.34} />
    </mesh>
    <mesh position={[0, 0, 0.315]}>
      <circleGeometry args={[0.19, 20]} />
      <meshStandardMaterial color={theme === 'dark' ? '#38284c' : '#60437f'}
        emissive="#714ba0" emissiveIntensity={0.15} />
    </mesh>
    <mesh position={[0, 0.32, 0.1]} rotation={[0, 0, 0]}>
      <cylinderGeometry args={[0.075, 0.075, 0.2, 12]} />
      <meshStandardMaterial color="#5d6e78" metalness={0.6} roughness={0.35} />
    </mesh>
    <sprite position={[0, 0.62, 0.18]} scale={[1.05, 0.295, 1]}>
      <spriteMaterial map={nameplate} transparent depthTest depthWrite={false} toneMapped={false} />
    </sprite>
  </group>
}
