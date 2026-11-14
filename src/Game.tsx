import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Environment from './Environment'
import Rifle from './Rifle'
import { playSound } from './audio'
import { advanceProjectile, createProjectile, isVisible, MAX_FLIGHT_SECONDS } from './ballistics'
import type { Projectile } from './ballistics'
import {
  BULLET_SPEED, GRAVITY, INITIAL_PITCH, INITIAL_YAW, initialStats,
  OBSERVER, SHOT_INTERVAL, SCOPE_SWAY_STRENGTH, targetMotion, targetPosition, ZERO_DISTANCE,
} from './world'
import type { GameStats, TargetSpec } from './world'

export interface Marker { id: number; x: number; y: number; distance: number; zone: string }
interface Props {
  roundSeed: number
  active: boolean
  targets: TargetSpec[]
  markersEnabled: boolean
  onStats: (stats: GameStats) => void
  onMarkers: (markers: Marker[]) => void
  onToggleMarkers: () => void
  onHelp: () => void
}

const aim = new THREE.Vector3()
const temp = new THREE.Vector3()
const projected = new THREE.Vector3()
const raycaster = new THREE.Raycaster()
const rotation = new THREE.Euler(0, 0, 0, 'YXZ')

function Target({ spec, stats }: { spec: TargetSpec; stats: React.RefObject<GameStats> }) {
  const group = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const future = useMemo(() => new THREE.Vector3(), [])
  const collision = { collision: true, targetId: spec.id }
  useFrame(() => {
    if (!group.current) return
    const t = stats.current.elapsed
    targetPosition(spec, t, group.current.position)
    targetPosition(spec, t + 0.05, future)
    const dx = future.x - group.current.position.x
    const dz = future.z - group.current.position.z
    if (Math.hypot(dx, dz) > 0.001) group.current.rotation.y = Math.atan2(dx, dz)
    // Braços e pernas voltam à posição neutra durante as pausas da caminhada.
    const motion = targetMotion(spec, t)
    const stride = Math.sin(motion.walkingTime * spec.speed * 7 + spec.phase) * 0.38 * motion.strideWeight
    if (leftLeg.current) leftLeg.current.rotation.x = stride
    if (rightLeg.current) rightLeg.current.rotation.x = -stride
    if (leftArm.current) leftArm.current.rotation.x = -stride * 0.8
    if (rightArm.current) rightArm.current.rotation.x = stride * 0.8
    group.current.visible = !stats.current.hits.includes(spec.id)
  }, -1)
  return <group ref={group} position={spec.position} userData={{ targetGroup: spec.id }}>
    <mesh position={[0, 0.28, 0]} castShadow userData={collision}>
      <boxGeometry args={[0.48, 0.58, 0.28]} /><meshStandardMaterial color={spec.clothing} roughness={0.95} />
    </mesh>
    <mesh position={[0, -0.08, 0]} castShadow userData={collision}>
      <boxGeometry args={[0.38, 0.2, 0.27]} /><meshStandardMaterial color="#343e3b" roughness={1} />
    </mesh>
    <mesh position={[0, 0.61, 0]} castShadow userData={collision}>
      <cylinderGeometry args={[0.085, 0.085, 0.13, 8]} /><meshStandardMaterial color={spec.skin} roughness={1} />
    </mesh>
    <mesh position={[0, 0.74, 0]} scale={[0.94, 1.12, 0.96]} castShadow userData={{ ...collision, headshot: true }}>
      <sphereGeometry args={[0.145, 12, 10]} /><meshStandardMaterial color={spec.skin} roughness={1} />
    </mesh>
    <mesh position={[0, 0.755, -0.015]} castShadow userData={{ ...collision, headshot: true }}>
      <sphereGeometry args={[0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#302c28" roughness={1} />
    </mesh>
    {[-1, 1].map(side => <group key={`leg-${side}`} ref={side < 0 ? leftLeg : rightLeg} position={[side * 0.12, -0.15, 0]}>
      <mesh position={[0, -0.34, 0]} castShadow userData={collision}>
        <boxGeometry args={[0.16, 0.68, 0.19]} /><meshStandardMaterial color="#3e4946" roughness={1} />
      </mesh>
      <mesh position={[0, -0.75, 0.065]} castShadow userData={collision}>
        <boxGeometry args={[0.19, 0.1, 0.32]} /><meshStandardMaterial color="#292d29" roughness={1} />
      </mesh>
    </group>)}
    {[-1, 1].map(side => <group key={`arm-${side}`} ref={side < 0 ? leftArm : rightArm} position={[side * 0.29, 0.48, 0]} rotation={[0, 0, side * 0.08]}>
      <mesh position={[0, -0.22, 0]} castShadow userData={collision}>
        <boxGeometry args={[0.145, 0.44, 0.17]} /><meshStandardMaterial color={spec.clothing} roughness={1} />
      </mesh>
      <mesh position={[0, -0.46, 0]} castShadow userData={collision}>
        <sphereGeometry args={[0.085, 8, 6]} /><meshStandardMaterial color={spec.skin} roughness={1} />
      </mesh>
    </group>)}
  </group>
}

export default function Game(props: Props) {
  const { camera, scene, gl, size } = useThree()
  const stats = useRef(initialStats(props.roundSeed))
  const propsRef = useRef(props)
  propsRef.current = props
  const pitch = useRef(INITIAL_PITCH)
  const yaw = useRef(INITIAL_YAW)
  const scoped = useRef(false)
  const recoil = useRef(0)
  const elapsed = useRef(0)
  const projectiles = useRef<Projectile[]>([])
  const colliders = useRef<THREE.Object3D[]>([])
  const swayWeight = useRef(0.16)
  const shotAt = useRef(-5)
  const messageUntil = useRef(0)
  const holding = useRef(false)
  const hudAt = useRef(0)
  const impact = useRef<THREE.Mesh>(null)
  const impactUntil = useRef(0)
  const tracer = useRef<THREE.Line>(null)
  const tracerObject = useMemo(() => new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: '#ffe8ab', transparent: true, opacity: 0.55 }),
  ), [])
  const breathCooldown = useRef(false)
  const publish = () => propsRef.current.onStats({ ...stats.current, hits: [...stats.current.hits] })

  const resolveImpact = (intersection: THREE.Intersection, projectile: Projectile) => {
    const s = stats.current
    impact.current?.position.copy(intersection.point)
    if (impact.current) impact.current.visible = true
    impactUntil.current = s.elapsed + 0.35
    const id = intersection.object.userData.targetId as number | undefined
    if (id && !s.hits.includes(id)) {
      let targetRoot = intersection.object.parent
      while (targetRoot && targetRoot.userData.targetGroup !== id) targetRoot = targetRoot.parent
      const local = targetRoot?.worldToLocal(intersection.point.clone())
      const bullseye = intersection.object.userData.headshot === true || !!local && Math.hypot(local.x, local.y - 0.28) < 0.12
      const distance = Math.round(projectile.origin.distanceTo(intersection.point))
      const points = 100 + Math.floor(distance / 10) + (bullseye ? 75 : 0) + (propsRef.current.targets.find(t => t.id === id)?.moving ? 50 : 0)
      s.hits.push(id)
      if (targetRoot) targetRoot.visible = false
      s.score += points
      s.hitFlash = s.elapsed + 0.35
      s.lastHit = `${bullseye ? 'NA MOSCA' : 'ALVO ACERTADO'} · ${distance} m · +${points}`
      s.message = s.lastHit
      messageUntil.current = s.elapsed + 3
      playSound('hit')
    } else {
      s.message = 'Não acertou · Ajuste a mira e tente novamente'
      messageUntil.current = s.elapsed + 1.8
    }
    publish()
  }

  useEffect(() => {
    camera.position.copy(OBSERVER)
    camera.rotation.set(INITIAL_PITCH, INITIAL_YAW, 0, 'YXZ')
    scene.add(camera)
    publish()
    const shoot = () => {
      if (!propsRef.current.active || stats.current.hits.length === propsRef.current.targets.length) return
      const s = stats.current
      if (s.elapsed - shotAt.current < SHOT_INTERVAL) return
      s.shots++
      shotAt.current = s.elapsed
      recoil.current = 1
      playSound('shot')
      camera.getWorldDirection(aim)
      const start = camera.position.clone()
      const right = new THREE.Vector3().crossVectors(aim, camera.up).normalize()
      const up = new THREE.Vector3().crossVectors(right, aim).normalize()
      // A elevação compensa a gravidade a 300 m e o vento desvia a trajetória.
      const velocity = aim.clone().multiplyScalar(BULLET_SPEED)
      velocity.addScaledVector(up, GRAVITY * ZERO_DISTANCE / (2 * BULLET_SPEED))
      const windAngle = THREE.MathUtils.degToRad(s.windDirection)
      const acceleration = new THREE.Vector3(
        Math.sin(windAngle) * s.wind * 0.7, -GRAVITY, -Math.cos(windAngle) * s.wind * 0.7,
      )
      projectiles.current.push(createProjectile(start, velocity, acceleration))
      pitch.current = Math.min(0.25, pitch.current + (s.scoped ? 0.002 : 0.01))
      publish()
    }
    const move = (event: MouseEvent) => {
      if (!propsRef.current.active) return
      const sensitivity = stats.current.scoped ? 0.00145 / stats.current.zoom : 0.0015
      yaw.current = THREE.MathUtils.clamp(yaw.current - event.movementX * sensitivity, -1.23, 1.23)
      pitch.current = THREE.MathUtils.clamp(pitch.current - event.movementY * sensitivity, -1.2, 0.28)
    }
    const down = (event: MouseEvent) => {
      if (!propsRef.current.active) return
      if (event.button === 0) shoot()
      if (event.button === 2) {
        stats.current.scoped = !stats.current.scoped
        scoped.current = stats.current.scoped
        publish()
      }
    }
    const keydown = (event: KeyboardEvent) => {
      if (!propsRef.current.active || event.repeat) return
      if (['KeyH', 'KeyF', 'ShiftLeft', 'ShiftRight'].includes(event.code)) event.preventDefault()
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') holding.current = true
      if (event.code === 'KeyH') propsRef.current.onToggleMarkers()
      if (event.code === 'KeyF') propsRef.current.onHelp()
    }
    const keyup = (event: KeyboardEvent) => {
      if (event.code.startsWith('Shift')) holding.current = false
    }
    const wheel = (event: WheelEvent) => {
      if (!propsRef.current.active || !stats.current.scoped) return
      event.preventDefault()
      const levels = [4, 8, 12]
      const index = levels.indexOf(stats.current.zoom)
      stats.current.zoom = levels[THREE.MathUtils.clamp(index + (event.deltaY < 0 ? 1 : -1), 0, 2)]
      publish()
    }
    const contextMenu = (event: Event) => event.preventDefault()
    document.addEventListener('mousemove', move)
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', keydown)
    document.addEventListener('keyup', keyup)
    gl.domElement.addEventListener('wheel', wheel, { passive: false })
    gl.domElement.addEventListener('contextmenu', contextMenu)
    colliders.current = []
    scene.traverse(object => {
      if (object.userData.collision) colliders.current.push(object)
    })
    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('keyup', keyup)
      gl.domElement.removeEventListener('wheel', wheel)
      gl.domElement.removeEventListener('contextmenu', contextMenu)
    }
  }, [camera, scene, gl])

  useFrame((_, delta) => {
    const s = stats.current
    const dt = Math.min(delta, 0.05)
    hudAt.current += dt
    if (props.active) {
      s.elapsed += dt
      if (holding.current && s.breath > 0 && !breathCooldown.current && s.scoped) {
        s.breath = Math.max(0, s.breath - dt * 15)
        s.steady = true
        if (s.breath === 0) breathCooldown.current = true
      } else {
        s.steady = false
        s.breath = Math.min(100, s.breath + dt * 10)
        if (s.breath >= 40 && !holding.current) breathCooldown.current = false
      }
    } else {
      holding.current = false
      s.steady = false
    }
    elapsed.current = s.elapsed
    if (props.active) swayWeight.current = THREE.MathUtils.damp(swayWeight.current, s.scoped ? (s.steady ? 0.055 : 1) : 0.16, 2.6, dt)
    const t = s.elapsed
    const weight = swayWeight.current * SCOPE_SWAY_STRENGTH
    // Respiração e pequenos ajustes posturais se combinam em um movimento lento e contínuo.
    const vertical = Math.sin(t * 0.15) * 0.00085 + Math.sin(t * 0.43 + 0.8) * 0.00042 + Math.sin(t * 1.91 + 0.4) * 0.00018
    const horizontal = Math.sin(t * 0.67 + 0.5) * 0.00095 + Math.sin(t * 0.29 + 2.1) * 0.00035 + Math.sin(t * 1.47) * 0.00015
    rotation.set(pitch.current + vertical * weight, yaw.current + horizontal * weight, Math.sin(t * 0.48) * 0.0003 * weight)
    camera.quaternion.setFromEuler(rotation)
    s.heading = ((-yaw.current * 180 / Math.PI) % 360 + 360) % 360
    const perspective = camera as THREE.PerspectiveCamera
    const desiredFov = s.scoped ? 55 / s.zoom : 55
    perspective.fov = THREE.MathUtils.damp(perspective.fov, desiredFov, 18, dt)
    perspective.updateProjectionMatrix()
    if (s.elapsed > messageUntil.current) s.message = ''
    if (impact.current) {
      impact.current.visible = s.elapsed < impactUntil.current
      impact.current.scale.setScalar(0.2 + Math.max(0, 0.35 - impactUntil.current + s.elapsed) * 3)
    }
    if (hudAt.current >= 0.1) {
      hudAt.current = 0
      camera.getWorldDirection(aim)
      raycaster.set(camera.position, aim)
      raycaster.far = 1500
      raycaster.near = 1
      const objects = colliders.current.filter(isVisible)
      const hit = raycaster.intersectObjects(objects, false)[0]
      s.distance = hit ? Math.round(hit.distance) : 0
      publish()
      const markers: Marker[] = []
      if (props.markersEnabled) props.targets.forEach(spec => {
        if (s.hits.includes(spec.id)) return
        targetPosition(spec, s.elapsed, temp)
        const distance = Math.round(camera.position.distanceTo(temp))
        // O indicador só aparece quando há visão direta do corpo ou da cabeça.
        let visible = false
        for (const offset of [0.28, 0.74]) {
          projected.copy(temp)
          projected.y += offset
          aim.copy(projected).sub(camera.position)
          raycaster.set(camera.position, aim.normalize())
          raycaster.far = camera.position.distanceTo(projected) + 0.2
          const first = raycaster.intersectObjects(objects, false)[0]
          if (first?.object.userData.targetId === spec.id) { visible = true; break }
        }
        if (!visible) return
        temp.y += 1.2
        projected.copy(temp).project(camera)
        if (projected.z > 0 && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.1) {
          markers.push({ id: spec.id, x: (projected.x + 1) * size.width / 2, y: (1 - projected.y) * size.height / 2, distance, zone: spec.zone })
        }
      })
      props.onMarkers(markers)
    }
  }, -2)

  useFrame((_, delta) => {
    if (!props.active) return
    if (projectiles.current.length) {
      scene.updateMatrixWorld(true)
      const survivors: Projectile[] = []
      for (const projectile of projectiles.current) {
        const intersection = advanceProjectile(projectile, Math.min(delta, 0.05), colliders.current)
        if (intersection) resolveImpact(intersection, projectile)
        else if (projectile.age < MAX_FLIGHT_SECONDS - 1e-8) survivors.push(projectile)
        else {
          stats.current.message = 'Disparo fora do terreno'
          messageUntil.current = stats.current.elapsed + 1.8
        }
      }
      projectiles.current = survivors
    }
    const latest = projectiles.current.at(-1)
    if (tracer.current) tracer.current.visible = !!latest
    if (latest) {
      temp.copy(latest.velocity).normalize().multiplyScalar(-12).add(latest.position)
      const positions = tracerObject.geometry.attributes.position as THREE.BufferAttribute
      positions.setXYZ(0, temp.x, temp.y, temp.z)
      positions.setXYZ(1, latest.position.x, latest.position.y, latest.position.z)
      positions.needsUpdate = true
      tracerObject.geometry.computeBoundingSphere()
    }
  })

  return <>
    <Environment targets={props.targets} />
    {props.targets.map(spec => <Target key={spec.id} spec={spec} stats={stats} />)}
    <Rifle scoped={scoped} recoil={recoil} elapsed={elapsed} />
    <mesh ref={impact} visible={false}><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color="#ffcb7a" transparent opacity={0.7} /></mesh>
    <primitive ref={tracer} object={tracerObject} visible={false} />
  </>
}
