import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BUILDINGS, heightAt, OBSERVER, random, TREES, WORLD_SIZE } from './world'
import type { TargetSpec } from './world'

const collision = { collision: true }
const dummy = new THREE.Object3D()

interface Instance {
  position: [number, number, number]
  scale: [number, number, number]
  color?: string
  rotation?: number
}

function Instances({ data, kind, color, collide = false, shadows = true }: {
  data: Instance[]
  kind: 'box' | 'cone' | 'sphere' | 'trunk' | 'plane'
  color: string
  collide?: boolean
  shadows?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!ref.current) return
    data.forEach((item, i) => {
      dummy.position.set(...item.position)
      dummy.scale.set(...item.scale)
      dummy.rotation.set(0, item.rotation ?? 0, 0)
      dummy.updateMatrix()
      ref.current!.setMatrixAt(i, dummy.matrix)
      if (item.color) ref.current!.setColorAt(i, new THREE.Color(item.color))
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [data])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, data.length]} castShadow={shadows} receiveShadow={shadows} userData={collide ? collision : {}}>
      {kind === 'box' && <boxGeometry />}
      {kind === 'plane' && <planeGeometry />}
      {kind === 'cone' && <coneGeometry args={[1, 1, 7]} />}
      {kind === 'sphere' && <icosahedronGeometry args={[1, 1]} />}
      {kind === 'trunk' && <cylinderGeometry args={[0.7, 1, 1, 6]} />}
      <meshStandardMaterial color={color} roughness={0.95} polygonOffset={kind === 'plane'} polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </instancedMesh>
  )
}

function Terrain() {
  const geometry = useMemo(() => {
    // A malha compartilha a mesma função de altura usada por objetos e alvos.
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 180, 180)
    geo.rotateX(-Math.PI / 2)
    const positions = geo.attributes.position
    const colors = new Float32Array(positions.count * 3)
    const rng = random(81)
    const low = new THREE.Color('#7e8c52')
    const high = new THREE.Color('#82857a')
    const tint = new THREE.Color()
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const z = positions.getZ(i)
      const h = heightAt(x, z)
      positions.setY(i, h)
      const slope = Math.abs(heightAt(x + 3, z) - heightAt(x - 3, z)) + Math.abs(heightAt(x, z + 3) - heightAt(x, z - 3))
      tint.copy(low).lerp(high, Math.min(1, Math.max(h / 130, slope / 8)))
      tint.multiplyScalar(0.89 + rng() * 0.2)
      colors.set([tint.r, tint.g, tint.b], i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    geo.computeBoundingBox()
    return geo
  }, [])
  return <mesh geometry={geometry} receiveShadow userData={collision}><meshStandardMaterial vertexColors roughness={1} /></mesh>
}

function City() {
  const windows = useMemo(() => {
    const result: Instance[] = []
    BUILDINGS.forEach(b => {
      for (let floor = 0; floor < Math.floor((b.h - 3) / 4); floor++) {
        for (let col = 0; col < 4; col++) {
          const x = b.x - b.w * 0.35 + col * b.w * 0.23
          const y = b.y + 3.5 + floor * 4
          // Planos afastados da fachada evitam disputa de profundidade e sombras tremidas.
          result.push({ position: [x, y, b.z + b.d / 2 + 0.16], scale: [2.2, 2.2, 1], color: floor % 3 === 1 ? '#718586' : '#435b60' })
          result.push({ position: [b.x + b.w / 2 + 0.16, y, b.z - b.d * 0.35 + col * b.d * 0.23], scale: [2.2, 2.2, 1], rotation: Math.PI / 2 })
        }
      }
    })
    return result
  }, [])
  const road = (x: number, z: number, horizontal: boolean) => {
    const width = horizontal ? 298 : 12
    const depth = horizontal ? 12 : 290
    const geo = new THREE.PlaneGeometry(width, depth, horizontal ? 60 : 2, horizontal ? 2 : 60)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const px = x + pos.getX(i)
      const pz = z + pos.getZ(i)
      pos.setXYZ(i, px, heightAt(px, pz) + 0.15, pz)
    }
    geo.computeVertexNormals()
    return geo
  }
  const roads = useMemo(() => Array.from({ length: 6 }, (_, i) => [
    road(-92.5, -262.5 + i * 55, true),
    road(-257.5 + i * 55, -122, false),
  ]).flat(), [])
  const lines = useMemo(() => {
    const data: Instance[] = []
    for (let i = 0; i < 6; i++) {
      const x = -257.5 + i * 55
      for (let z = -260; z < 22; z += 13) data.push({ position: [x, heightAt(x, z) + 0.21, z], scale: [0.28, 0.04, 5] })
    }
    return data
  }, [])
  return (
    <group>
      {roads.map((geo, i) => <mesh key={i} geometry={geo} receiveShadow><meshStandardMaterial color="#606963" roughness={1} /></mesh>)}
      <Instances data={lines} kind="box" color="#d6cba0" />
      {BUILDINGS.map((b, i) => (
        <group key={i} position={[b.x, b.y, b.z]}>
          <mesh position={[0, b.h / 2, 0]} castShadow receiveShadow userData={collision}>
            <boxGeometry args={[b.w, b.h, b.d]} /><meshStandardMaterial color={b.color} roughness={0.92} />
          </mesh>
          <mesh position={[0, b.h + 0.3, 0]} castShadow userData={collision}>
            <boxGeometry args={[b.w + 0.7, 0.6, b.d + 0.7]} /><meshStandardMaterial color="#68736d" />
          </mesh>
          {b.roof && <mesh position={[0, b.h + b.w * 0.12, 0]} rotation={[0, Math.PI / 4, 0]} castShadow userData={collision}>
            <coneGeometry args={[b.w * 0.72, b.w * 0.24, 4]} /><meshStandardMaterial color="#8b6352" roughness={0.95} />
          </mesh>}
          <mesh position={[b.w * 0.28, b.h + 1.2, -b.d * 0.23]} castShadow>
            <boxGeometry args={[4, 1.8, 3]} /><meshStandardMaterial color="#929b95" />
          </mesh>
          <mesh position={[0, 1.6, b.d / 2 + 0.16]}>
            {/* A porta plana usa separação de profundidade para não piscar sobre a fachada. */}
            <planeGeometry args={[2.8, 3.2]} /><meshStandardMaterial color="#46534d" roughness={0.95} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
        </group>
      ))}
      <Instances data={windows} kind="plane" color="#4b6467" shadows={false} />
      {[-202.5, -92.5, 17.5].map((x, i) => <Car key={x} x={x} z={-185 + i * 74} color={['#b66d42', '#b9c2b9', '#526f76'][i]} />)}
      {Array.from({ length: 8 }, (_, i) => {
        const x = -257.5 + (i % 4) * 88
        const z = i < 4 ? 35 : -155
        return <group key={i} position={[x + 7, heightAt(x + 7, z), z]}>
          <mesh position={[0, 4, 0]}><cylinderGeometry args={[0.13, 0.18, 8, 5]} /><meshStandardMaterial color="#46564e" /></mesh>
          <mesh position={[1.2, 8, 0]}><boxGeometry args={[2.5, 0.3, 0.7]} /><meshStandardMaterial color="#bec5b2" /></mesh>
        </group>
      })}
    </group>
  )
}

function Car({ x, z, color }: { x: number; z: number; color: string }) {
  return <group position={[x, heightAt(x, z) + 0.8, z]}>
    <mesh castShadow userData={collision}><boxGeometry args={[3.8, 1.4, 7.5]} /><meshStandardMaterial color={color} roughness={0.5} /></mesh>
    <mesh position={[0, 1.1, -0.4]} castShadow userData={collision}><boxGeometry args={[3.3, 1.4, 3.7]} /><meshStandardMaterial color="#435b61" metalness={0.3} roughness={0.4} /></mesh>
    {[-1.9, 1.9].flatMap(dx => [-2.2, 2.2].map(dz => <mesh key={`${dx}-${dz}`} position={[dx, -0.1, dz]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.8, 0.8, 0.4, 10]} /><meshStandardMaterial color="#232d2b" /></mesh>))}
  </group>
}

function Forest() {
  const path = useMemo(() => {
    const geo = new THREE.PlaneGeometry(5, 285, 2, 60)
    geo.rotateX(-Math.PI / 2)
    const positions = geo.attributes.position
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) + 200
      const z = positions.getZ(i) - 60
      positions.setXYZ(i, x, heightAt(x, z) + 0.18, z)
    }
    geo.computeVertexNormals()
    return geo
  }, [])
  const [trunks, pines, crowns, bushes] = useMemo(() => {
    const rng = random(982)
    const trunks: Instance[] = []
    const pines: Instance[] = []
    const crowns: Instance[] = []
    const bushes: Instance[] = []
    // As árvores permanecem no cenário e também orientam os trajetos dos alvos.
    for (const tree of TREES) {
      const { x, z, y, h, color: shade } = tree
      trunks.push({ position: [x, y + h * 0.35, z], scale: [0.55, h * 0.7, 0.55] })
      if (tree.pine) {
        pines.push({ position: [x, y + h * 0.64, z], scale: [h * 0.26, h * 0.78, h * 0.26], color: shade })
        pines.push({ position: [x, y + h * 0.85, z], scale: [h * 0.19, h * 0.6, h * 0.19], color: shade })
      } else {
        crowns.push({ position: [x, y + h * 0.7, z], scale: [h * 0.32, h * 0.4, h * 0.3], color: shade })
        crowns.push({ position: [x + 2, y + h * 0.83, z - 1], scale: [h * 0.24, h * 0.27, h * 0.25], color: shade })
      }
    }
    for (let i = 0; i < 160; i++) {
      const x = -350 + rng() * 750
      const z = 65 + rng() * 260
      if (Math.abs(x) < 50 && z > 310) continue
      bushes.push({ position: [x, heightAt(x, z) + 0.7, z], scale: [1.5 + rng() * 2, 1 + rng(), 1.4 + rng()], color: '#65724a' })
    }
    return [trunks, pines, crowns, bushes]
  }, [])
  return <group>
    <Instances data={trunks} kind="trunk" color="#655a40" collide />
    <Instances data={pines} kind="cone" color="#506445" collide />
    <Instances data={crowns} kind="sphere" color="#526949" collide />
    <Instances data={bushes} kind="sphere" color="#65724a" />
    <mesh geometry={path} receiveShadow>
      <meshStandardMaterial color="#baaf88" roughness={1} />
    </mesh>
    {[90, -90].map(z => <group key={z} position={[213, heightAt(213, z), z]}>
      <mesh position={[0, 1, 0]}><boxGeometry args={[6, 0.35, 1.6]} /><meshStandardMaterial color="#827154" /></mesh>
      <mesh position={[0, 1.9, -0.8]}><boxGeometry args={[6, 1.5, 0.25]} /><meshStandardMaterial color="#827154" /></mesh>
    </group>)}
  </group>
}

function Landmarks({ targets }: { targets: TargetSpec[] }) {
  const rocks = useMemo(() => {
    const rng = random(64)
    return Array.from({ length: 65 }, (_, i): Instance => {
      const x = i < 25 ? (rng() - 0.5) * 250 : 330 + rng() * 120
      const z = i < 25 ? 330 + rng() * 155 : -230 + rng() * 490
      return { position: [x, heightAt(x, z) - 1, z], scale: [4 + rng() * 9, 3 + rng() * 9, 4 + rng() * 8], color: '#83867a', rotation: rng() * 6 }
    }).filter(rock => {
      const [x, , z] = rock.position
      if (Math.hypot(x - OBSERVER.x, z - OBSERVER.z) < 24) return false
      return !targets.some(target => {
        const fraction = (z - OBSERVER.z) / (target.position[2] - OBSERVER.z)
        const lineX = OBSERVER.x + target.position[0] * fraction
        return fraction > 0 && fraction < 1.04 && Math.abs(x - lineX) < (target.moving ? 23 : 14)
      })
    })
  }, [targets])
  return <group>
    <Instances data={rocks} kind="sphere" color="#85877c" collide />
    <group position={[-321, heightAt(-321, -155), -155]}>
      {[-5, 5].flatMap(x => [-5, 5].map(z => <mesh key={`${x}-${z}`} position={[x, 11, z]} castShadow userData={collision}><boxGeometry args={[0.9, 22, 0.9]} /><meshStandardMaterial color="#776b4e" /></mesh>))}
      <mesh position={[0, 22, 0]} castShadow userData={collision}><boxGeometry args={[13, 1, 13]} /><meshStandardMaterial color="#827459" /></mesh>
      <mesh position={[0, 28, -8]} castShadow userData={collision}><coneGeometry args={[10, 4, 4]} /><meshStandardMaterial color="#5b6c5b" /></mesh>
      <mesh position={[-5, 12, 6]} rotation={[0.35, 0, 0]}><boxGeometry args={[2.5, 26, 0.7]} /><meshStandardMaterial color="#8f8060" /></mesh>
    </group>
    <group position={[150, heightAt(150, -315), -315]}>
      {[0, 22].map(x => <group key={x} position={[x, 0, -8]}>
        <mesh position={[0, 3, 0]} rotation={[0, 0, Math.PI / 2]} castShadow userData={collision}><cylinderGeometry args={[6, 6, 12, 3]} /><meshStandardMaterial color="#9f8d59" side={THREE.DoubleSide} /></mesh>
      </group>)}
      <mesh position={[-13, 1.5, 16]} castShadow userData={collision}><boxGeometry args={[9, 3, 4]} /><meshStandardMaterial color="#6d7970" /></mesh>
    </group>
    <mesh position={[290, 0.4, -335]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[76, 64]} /><meshStandardMaterial color="#619396" metalness={0.45} roughness={0.24} transparent opacity={0.9} />
    </mesh>
    {[-390, -320].map((x, i) => <group key={x} position={[x, heightAt(x, -365 - i * 55), -365 - i * 55]}>
      <mesh position={[0, 25, 0]} castShadow><cylinderGeometry args={[0.9, 2.1, 50, 8]} /><meshStandardMaterial color="#d6d8c9" /></mesh>
      <mesh position={[0, 50, 1.8]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1.6, 1.6, 4, 10]} /><meshStandardMaterial color="#bec7bc" /></mesh>
      {[0, 1, 2].map(j => <group key={j} position={[0, 50, 4]} rotation={[0, 0, j * Math.PI * 2 / 3 + 0.4]}>
        <mesh position={[0, 10, 0]}><boxGeometry args={[1.4, 21, 0.45]} /><meshStandardMaterial color="#d7dacb" /></mesh>
      </group>)}
    </group>)}
    <group position={[0, heightAt(0, 385) - 0.3, 385]}>
      <mesh receiveShadow><cylinderGeometry args={[9, 12, 2, 9]} /><meshStandardMaterial color="#8f9284" /></mesh>
      <mesh position={[5, 1.3, 2]}><boxGeometry args={[2, 0.6, 1.5]} /><meshStandardMaterial color="#5d6d53" /></mesh>
    </group>
  </group>
}

function Sky() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#739db2') },
      bottom: { value: new THREE.Color('#d1d8c5') },
    },
    vertexShader: `varying vec3 vPosition;
      void main() { vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPosition;
      void main() {
        vec3 d = normalize(vPosition);
        float h = pow(max(d.y, 0.0), 0.55);
        vec3 color = mix(bottom, top, h);
        float sun = pow(max(dot(d, normalize(vec3(-0.6, 0.55, -0.6))), 0.0), 280.0);
        color += vec3(1.0, 0.83, 0.52) * sun * 0.8;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), [])
  return <mesh material={material}><sphereGeometry args={[2100, 32, 20]} /></mesh>
}

export default function Environment({ targets }: { targets: TargetSpec[] }) {
  return <>
    <Sky />
    <fog attach="fog" args={['#b9cabc', 480, 1700]} />
    <hemisphereLight args={['#d7e6e8', '#767b4c', 2.3]} />
    <directionalLight position={[-280, 400, 170]} intensity={2.8} color="#fff0cf" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-390} shadow-camera-right={390} shadow-camera-top={380} shadow-camera-bottom={-380} shadow-camera-far={1100} shadow-bias={-0.001} shadow-normalBias={0.5} />
    <Terrain />
    <City />
    <Forest />
    <Landmarks targets={targets} />
  </>
}
