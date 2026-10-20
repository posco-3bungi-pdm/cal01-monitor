import * as THREE from 'three'

export function labelOccluders(scene: THREE.Object3D): THREE.Object3D[] {
  const meshes: THREE.Object3D[] = []
  scene.traverseVisible(object => {
    if (!object.name.startsWith('SHELL_') && !object.name.startsWith('ZONE_FRAME_')
      && object.name !== 'FRAME_AND_WALKWAYS') return
    object.traverseVisible(child => {
      if (child instanceof THREE.Mesh) meshes.push(child)
    })
  })
  return meshes
}

export function anchorOccluded(origin: THREE.Vector3, anchor: THREE.Vector3, meshes: THREE.Object3D[], ray: THREE.Raycaster) {
  const distance = origin.distanceTo(anchor)
  if (distance < 0.1) return false
  ray.set(origin, ray.ray.direction.copy(anchor).sub(origin).normalize())
  ray.near = 0
  ray.far = distance - 0.08
  return ray.intersectObjects(meshes, false).length > 0
}
