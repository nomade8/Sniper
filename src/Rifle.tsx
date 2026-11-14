import { useRef } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const metal = <meshStandardMaterial color="#303c39" metalness={0.8} roughness={0.34} />
const dark = <meshStandardMaterial color="#1b2422" metalness={0.4} roughness={0.5} />
const olive = <meshStandardMaterial color="#677050" metalness={0.15} roughness={0.72} />

function Cylinder({ position, radius, length, color = '#303c39' }: {
  position: [number, number, number]; radius: number; length: number; color?: string
}) {
  return <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
    <cylinderGeometry args={[radius, radius, length, 16]} />
    <meshStandardMaterial color={color} metalness={0.75} roughness={0.35} />
  </mesh>
}

export default function Rifle({ scoped, recoil, elapsed }: {
  scoped: React.RefObject<boolean>
  recoil: React.RefObject<number>
  elapsed: React.RefObject<number>
}) {
  const { camera } = useThree()
  const group = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (!group.current) return
    const g = group.current
    g.visible = !scoped.current
    g.position.set(0.255, -0.265 + Math.sin(elapsed.current * 1.5) * 0.003, -0.47 + recoil.current * 0.1)
    g.rotation.set(0.035 + recoil.current * 0.12, -0.025, -0.04)
    recoil.current = THREE.MathUtils.damp(recoil.current, 0, 11, dt)
  })
  return createPortal(
    <group ref={group}>
      <mesh position={[0, -0.014, 0.17]} rotation={[0.08, 0, 0]}>
        <boxGeometry args={[0.075, 0.115, 0.34]} />{olive}
      </mesh>
      <mesh position={[0, -0.014, 0.345]}><boxGeometry args={[0.085, 0.13, 0.025]} />{dark}</mesh>
      <mesh position={[0, -0.053, 0.075]} rotation={[-0.3, 0, 0]}><boxGeometry args={[0.043, 0.12, 0.057]} />{olive}</mesh>
      <mesh position={[0, 0.015, -0.11]}><boxGeometry args={[0.085, 0.076, 0.36]} />{metal}</mesh>
      <mesh position={[0, -0.045, -0.15]} rotation={[0.1, 0, 0]}><boxGeometry args={[0.049, 0.096, 0.085]} />{dark}</mesh>
      <mesh position={[0, 0.006, -0.33]}><boxGeometry args={[0.072, 0.069, 0.27]} />{olive}</mesh>
      <Cylinder position={[0, 0.032, -0.59]} radius={0.016} length={0.47} />
      <Cylinder position={[0, 0.032, -0.846]} radius={0.026} length={0.08} color="#202b28" />
      <mesh position={[0, 0.032, -0.888]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.012, 12]} /><meshBasicMaterial color="#090d0c" /></mesh>
      <mesh position={[0, 0.071, -0.13]}><boxGeometry args={[0.038, 0.014, 0.31]} />{dark}</mesh>
      {[-0.03, -0.23].map(z => <mesh key={z} position={[0, 0.098, z]}><boxGeometry args={[0.052, 0.054, 0.025]} />{metal}</mesh>)}
      <Cylinder position={[0, 0.14, -0.115]} radius={0.033} length={0.32} color="#1b2522" />
      <Cylinder position={[0, 0.14, 0.073]} radius={0.046} length={0.077} color="#27332f" />
      <Cylinder position={[0, 0.14, -0.307]} radius={0.051} length={0.091} color="#27332f" />
      <mesh position={[0, 0.14, 0.113]}><circleGeometry args={[0.037, 20]} /><meshStandardMaterial color="#174451" metalness={0.9} roughness={0.1} /></mesh>
      <mesh position={[0, 0.19, -0.12]}><cylinderGeometry args={[0.022, 0.022, 0.027, 14]} />{metal}</mesh>
      <mesh position={[0.043, 0.14, -0.12]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.02, 0.02, 0.027, 14]} />{metal}</mesh>
      <mesh position={[0.072, 0.034, 0.01]} rotation={[0, 0, -0.5]}><cylinderGeometry args={[0.007, 0.007, 0.07, 8]} />{metal}</mesh>
      <mesh position={[0.09, 0.006, 0.01]}><sphereGeometry args={[0.017, 12, 8]} />{dark}</mesh>
      <mesh position={[0, -0.06, -0.01]}><torusGeometry args={[0.036, 0.006, 6, 16]} />{metal}</mesh>
      <mesh position={[0, -0.06, -0.017]} rotation={[0, 0, 0.4]}><boxGeometry args={[0.009, 0.04, 0.012]} />{metal}</mesh>
      {Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[0.037, 0.014, -0.25 - i * 0.027]}><boxGeometry args={[0.002, 0.019, 0.013]} />{dark}</mesh>)}
    </group>, camera,
  )
}
