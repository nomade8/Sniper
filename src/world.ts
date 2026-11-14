import * as THREE from 'three'

export const WORLD_SIZE = 1000
export const TARGET_COUNT = 12
export const BULLET_SPEED = 820
export const ZERO_DISTANCE = 300
export const GRAVITY = 9.81
export const SHOT_INTERVAL = 0.9
export const SCOPE_SWAY_STRENGTH = 1

export function random(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

export function heightAt(x: number, z: number) {
  const mountain = 132 * Math.exp(-((x / 175) ** 2) - (((z - 440) / 135) ** 2))
  const edges = 32 * Math.max(0, (Math.abs(x) - 355) / 145) ** 2
  const lake = 12 * Math.exp(-(((x - 290) / 84) ** 2) - (((z + 335) / 82) ** 2))
  const rolling = 2.8 * Math.sin(x * 0.011) * Math.cos(z * 0.014)
  return 5 + rolling + mountain + edges - lake
}

export const OBSERVER = new THREE.Vector3(0, heightAt(0, 385) + 4.1, 385)
export const INITIAL_PITCH = -0.235
export const INITIAL_YAW = -0.075

export interface Building {
  x: number
  z: number
  w: number
  d: number
  h: number
  y: number
  color: string
  roof: boolean
}

export const BUILDINGS: Building[] = (() => {
  const rng = random(28)
  const result: Building[] = []
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const x = -230 + col * 55
      const z = -235 + row * 55
      const w = 21 + rng() * 12
      const d = 22 + rng() * 13
      const h = 10 + rng() * 23
      result.push({
        x, z, w, d, h, y: heightAt(x, z),
        color: ['#bdb6a2', '#d5cbb5', '#aba99b', '#c6b59e', '#b3bbad'][Math.floor(rng() * 5)],
        roof: rng() > 0.7,
      })
    }
  }
  return result
})()

export interface TargetSpec {
  id: number
  position: [number, number, number]
  zone: string
  moving: boolean
  phase: number
  route: [number, number][]
  distances: number[]
  speed: number
  walkDuration: number
  pauseDuration: number
  loop: boolean
  clothing: string
  skin: string
}

interface Tree {
  x: number
  z: number
  y: number
  h: number
  color: string
  pine: boolean
}

export const TREES = (() => {
  const rng = random(982)
  const trees: Tree[] = []
  for (let i = 0; i < 450; i++) {
    const park = i < 300
    const x = park ? 80 + rng() * 267 : -430 + rng() * 150
    const z = park ? -235 + rng() * 330 : -365 + rng() * 390
    if (Math.abs(x - 200) < 8 || Math.hypot(x - 290, z + 335) < 95) continue
    const h = 10 + rng() * 11
    const color = ['#405d40', '#526a43', '#607449', '#3d5944'][Math.floor(rng() * 4)]
    trees.push({ x, z, y: heightAt(x, z), h, color, pine: rng() > 0.4 || !park })
  }
  // Retira cerca de 25% de cada floresta, preservando a distribuição das árvores restantes.
  return [1, -1].flatMap(side => {
    const forest = trees.filter(tree => Math.sign(tree.x) === side)
    const count = Math.round(forest.length * 0.75)
    return forest.filter((_, index) =>
      Math.floor((index + 1) * count / forest.length) > Math.floor(index * count / forest.length))
  })
})()

const buildingBoxes = BUILDINGS.map(b => new THREE.Box3(
  new THREE.Vector3(b.x - b.w / 2 - 0.4, b.y, b.z - b.d / 2 - 0.4),
  new THREE.Vector3(b.x + b.w / 2 + 0.4, b.y + b.h + (b.roof ? b.w * 0.24 : 0.6), b.z + b.d / 2 + 0.4),
))
const treeBoxes = TREES.map(t => {
  const radius = t.h * (t.pine ? 0.26 : 0.34)
  return new THREE.Box3(
    new THREE.Vector3(t.x - radius, t.y + t.h * 0.25, t.z - radius),
    new THREE.Vector3(t.x + radius, t.y + t.h * 1.15, t.z + radius),
  )
})
const viewObstacles = [...buildingBoxes, ...treeBoxes]
const walkingObstacles = [
  ...BUILDINGS,
  { x: -202.5, z: -185, w: 3.8, d: 7.5 },
  { x: -92.5, z: -111, w: 3.8, d: 7.5 },
  { x: 17.5, z: -37, w: 3.8, d: 7.5 },
  { x: 213, z: 90, w: 6, d: 2 },
  { x: 213, z: -90, w: 6, d: 2 },
].map(o => new THREE.Box3(
  new THREE.Vector3(o.x - o.w / 2 - 0.8, -1, o.z - o.d / 2 - 0.8),
  new THREE.Vector3(o.x + o.w / 2 + 0.8, 1, o.z + o.d / 2 + 0.8),
))

export function clearView(position: [number, number, number]) {
  const destination = new THREE.Vector3(...position)
  const direction = destination.clone().sub(OBSERVER).normalize()
  const ray = new THREE.Ray(OBSERVER, direction)
  const point = new THREE.Vector3()
  const distance = OBSERVER.distanceTo(destination)
  for (const box of viewObstacles) {
    if (ray.intersectBox(box, point) && OBSERVER.distanceTo(point) < distance - 0.2) return false
  }
  for (let fraction = 0.02; fraction < 1; fraction += 0.01) {
    point.lerpVectors(OBSERVER, destination, fraction)
    if (point.y < heightAt(point.x, point.z) + 0.2) return false
  }
  return true
}

function segmentDistance(x: number, z: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const fraction = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1)
  return Math.hypot(x - a[0] - dx * fraction, z - a[1] - dz * fraction)
}

export function walkableSegment(a: [number, number], b: [number, number]) {
  if (TREES.some(t => segmentDistance(t.x, t.z, a, b) < 1.2)) return false
  const start = new THREE.Vector3(a[0], 0, a[1])
  const end = new THREE.Vector3(b[0], 0, b[1])
  const ray = new THREE.Ray(start, end.clone().sub(start).normalize())
  const point = new THREE.Vector3()
  return !walkingObstacles.some(box => {
    return box.containsPoint(start) || (ray.intersectBox(box, point) !== null && start.distanceTo(point) <= start.distanceTo(end))
  })
}

function routeDistances(route: [number, number][]) {
  const distances = [0]
  for (let i = 1; i < route.length; i++) {
    distances.push(distances[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]))
  }
  return distances
}

export function makeTargets(seed: number): TargetSpec[] {
  const rng = random(seed)
  const targets: TargetSpec[] = []
  const outfit = ['#7e4936', '#53657d', '#a68e5d', '#6c7048', '#62546f', '#79878b']
  for (let i = 0; i < TARGET_COUNT; i++) {
    const forest = i >= 5
    // Distribui quatro alvos na floresta direita e três na esquerda.
    const bounds = i >= 9
      ? { minX: -425, maxX: -285, minZ: -360, maxZ: 20 }
      : { minX: 90, maxX: 335, minZ: -230, maxZ: 92 }
    let chosen: TargetSpec | undefined
    let best: TargetSpec | undefined
    let bestExposure = 0
    for (let attempt = 0; attempt < 500; attempt++) {
      let route: [number, number][]
      if (forest) {
        route = [[
          bounds.minX + 5 + rng() * (bounds.maxX - bounds.minX - 10),
          bounds.minZ + 5 + rng() * (bounds.maxZ - bounds.minZ - 10),
        ]]
        for (let step = 0; step < 5; step++) {
          const previous = route.at(-1)!
          let next: [number, number] | undefined
          for (let trial = 0; trial < 20; trial++) {
            const angle = rng() * Math.PI * 2
            const length = 18 + rng() * 32
            const candidate: [number, number] = [previous[0] + Math.cos(angle) * length, previous[1] + Math.sin(angle) * length]
            if (candidate[0] < bounds.minX || candidate[0] > bounds.maxX || candidate[1] < bounds.minZ || candidate[1] > bounds.maxZ) continue
            if (walkableSegment(previous, candidate)) { next = candidate; break }
          }
          if (!next) break
          route.push(next)
        }
        if (route.length < 4) continue
      } else {
        const col = Math.floor(rng() * 5)
        const row = Math.floor(rng() * 5)
        const x = -257.5 + col * 55 + (rng() - 0.5) * 5
        const z = -262.5 + row * 55 + (rng() - 0.5) * 5
        const width = 55 * (1 + Math.floor(rng() * Math.min(2, 5 - col)))
        const depth = 55 * (1 + Math.floor(rng() * Math.min(2, 5 - row)))
        route = [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth], [x, z]]
        if (rng() > 0.5) route.reverse()
        if (route.slice(1).some((p, index) => !walkableSegment(route[index], p))) continue
      }
      const spec: TargetSpec = {
        id: i + 1, position: [0, 0, 0], zone: forest ? 'FLORESTA' : 'RUA',
        moving: true, phase: rng() * Math.PI * 2, route, distances: routeDistances(route),
        speed: 0.8 + rng() * 0.9, loop: !forest,
        walkDuration: 6 + rng() * 7, pauseDuration: 2 + rng() * 4,
        clothing: outfit[Math.floor(rng() * outfit.length)],
        skin: ['#bf9576', '#a67958', '#d0ac8c', '#805c45'][Math.floor(rng() * 4)],
      }
      const position = targetPosition(spec, 0, new THREE.Vector3())
      spec.position = position.toArray() as [number, number, number]
      if (targets.some(t => Math.hypot(t.position[0] - position.x, t.position[2] - position.z) < 14)) continue
      // O percurso precisa oferecer janelas de visão e trechos encobertos pelos obstáculos.
      let visible = 0
      for (let sample = 0; sample < 24; sample++) {
        positionAlongRoute(spec, sample * spec.distances.at(-1)! / (24 * spec.speed), position)
        if (clearView(position.toArray() as [number, number, number])) visible++
      }
      if (visible < 24 && visible > bestExposure) { best = spec; bestExposure = visible }
      if (visible >= 3 && visible < 24) { chosen = spec; break }
    }
    if (!chosen) chosen = best
    if (!chosen) throw new Error('Não foi possível gerar um percurso acessível para os alvos.')
    targets.push(chosen)
  }
  return targets
}

export function targetMotion(spec: TargetSpec, elapsed: number) {
  if (!spec.moving) return { walkingTime: 0, strideWeight: 0 }
  const period = spec.walkDuration + spec.pauseDuration
  const offset = spec.phase / (Math.PI * 2) * period
  const time = Math.max(0, elapsed) + offset
  const local = time % period
  // Conta apenas o tempo caminhando e suaviza os membros ao parar e retomar.
  const walkingTime = Math.floor(time / period) * spec.walkDuration
    + Math.min(local, spec.walkDuration) - Math.min(offset, spec.walkDuration)
  const strideWeight = THREE.MathUtils.smoothstep(local, 0, 0.35)
    * (1 - THREE.MathUtils.smoothstep(local, spec.walkDuration - 0.35, spec.walkDuration))
  return { walkingTime, strideWeight }
}

export function targetPosition(spec: TargetSpec, elapsed: number, out: THREE.Vector3) {
  return positionAlongRoute(spec, targetMotion(spec, elapsed).walkingTime, out)
}

function positionAlongRoute(spec: TargetSpec, walkingTime: number, out: THREE.Vector3) {
  const total = spec.distances.at(-1)!
  const cycle = spec.loop ? total : total * 2
  let distance = (walkingTime * spec.speed + spec.phase / (Math.PI * 2) * cycle) % cycle
  if (distance > total) distance = cycle - distance
  let index = 1
  while (index < spec.distances.length - 1 && spec.distances[index] < distance) index++
  const fraction = (distance - spec.distances[index - 1]) / (spec.distances[index] - spec.distances[index - 1])
  const a = spec.route[index - 1]
  const b = spec.route[index]
  const x = THREE.MathUtils.lerp(a[0], b[0], fraction)
  const z = THREE.MathUtils.lerp(a[1], b[1], fraction)
  out.set(x, heightAt(x, z) + 0.95, z)
  return out
}

export interface GameStats {
  hits: number[]
  shots: number
  score: number
  scoped: boolean
  zoom: number
  steady: boolean
  breath: number
  elapsed: number
  distance: number
  heading: number
  wind: number
  windDirection: number
  message: string
  hitFlash: number
  lastHit: string
}

export function initialStats(seed = 0): GameStats {
  // A semente mantém o vento da rodada igual no painel e na trajetória dos tiros.
  const rng = random(seed ^ 0x9e3779b9)
  rng()
  const wind = Math.round((0.6 + rng() * 3) * 10) / 10
  const windDirection = Math.floor(rng() * 360)
  return {
    hits: [], shots: 0, score: 0,
    scoped: false, zoom: 8, steady: false,
    breath: 100, elapsed: 0, distance: 0, heading: 4, wind, windDirection,
    message: '', hitFlash: 0, lastHit: '',
  }
}
