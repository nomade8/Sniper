import * as THREE from 'three'

export const MAX_FLIGHT_SECONDS = 1.6
const PHYSICS_STEP = 0.01
const next = new THREE.Vector3()
const segment = new THREE.Vector3()
const raycaster = new THREE.Raycaster()
const intersections: THREE.Intersection[] = []

export interface Projectile {
  origin: THREE.Vector3
  position: THREE.Vector3
  velocity: THREE.Vector3
  acceleration: THREE.Vector3
  age: number
}

export function createProjectile(origin: THREE.Vector3, velocity: THREE.Vector3, acceleration: THREE.Vector3): Projectile {
  return { origin: origin.clone(), position: origin.clone(), velocity: velocity.clone(), acceleration: acceleration.clone(), age: 0 }
}

export function isVisible(object: THREE.Object3D) {
  let ancestor: THREE.Object3D | null = object
  while (ancestor) {
    if (!ancestor.visible) return false
    ancestor = ancestor.parent
  }
  return true
}

export function advanceProjectile(projectile: Projectile, delta: number, colliders: THREE.Object3D[]): THREE.Intersection | undefined {
  let remaining = Math.min(delta, MAX_FLIGHT_SECONDS - projectile.age)
  while (remaining > 1e-8) {
    // Os segmentos curtos verificam o caminho percorrido sem atravessar obstáculos.
    const step = Math.min(PHYSICS_STEP, remaining)
    next.copy(projectile.position).addScaledVector(projectile.velocity, step).addScaledVector(projectile.acceleration, 0.5 * step * step)
    segment.copy(next).sub(projectile.position)
    const length = segment.length()
    raycaster.set(projectile.position, segment.normalize())
    raycaster.near = 0
    raycaster.far = length
    intersections.length = 0
    raycaster.intersectObjects(colliders, false, intersections)
    const hit = intersections.find(intersection => isVisible(intersection.object))
    if (hit) {
      projectile.age += step * hit.distance / length
      projectile.position.copy(hit.point)
      return hit
    }
    projectile.position.copy(next)
    projectile.velocity.addScaledVector(projectile.acceleration, step)
    projectile.age += step
    remaining -= step
  }
}
