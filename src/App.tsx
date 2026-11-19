import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Game from './Game'
import type { Marker } from './Game'
import { initialStats, makeTargets, OBSERVER, TARGET_COUNT } from './world'
import { resumeAudio } from './audio'

function Icon({ name, size = 20 }: { name: 'mountain' | 'crosshair' | 'arrow' | 'wind' | 'clock' | 'scope' | 'sound'; size?: number }) {
  const paths = {
    mountain: <><path d="m2 19 7-13 4 7 3-5 6 11H2Z" /><path d="m7 10 2 2 2-2M14 12l2 2 2-2" /></>,
    crosshair: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    wind: <><path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    scope: <><circle cx="12" cy="12" r="9" /><path d="M12 3v6m0 6v6M3 12h6m6 0h6" /></>,
    sound: <><path d="m11 4-6 5H2v6h3l6 5V4Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

function Reticle() {
  return <div className="scope-overlay" aria-hidden="true">
    <div className="scope-lens">
      <svg className="reticle" viewBox="0 0 1000 1000">
        <defs><radialGradient id="lensShade"><stop offset="50%" stopColor="#09130e" stopOpacity="0" /><stop offset="100%" stopColor="#09130e" stopOpacity=".3" /></radialGradient></defs>
        <circle cx="500" cy="500" r="499" fill="url(#lensShade)" />
        <g stroke="#162520" strokeWidth="1.35" opacity=".9">
          <path d="M0 500h487m26 0h487M500 0v487m0 26v487" />
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <g key={i}>
            <path d={`M${500 - i * 32} 493v14M${500 + i * 32} 493v14M493 ${500 - i * 32}h14M${500 - 6 - i * 1.5} ${500 + i * 32}h${12 + i * 3}`} />
            {i % 2 === 0 && <text x="516" y={504 + i * 32} stroke="none" fill="#162520" fontSize="12" fontFamily="monospace">{i}</text>}
          </g>)}
        </g>
        <circle cx="500" cy="500" r="2.6" fill="#ca602e" />
        <path d="M325 790h190m-190 0q30-60 190-87" stroke="#162520" strokeWidth="1.3" fill="none" opacity=".75" />
        <text x="325" y="810" fontFamily="monospace" fontSize="12" fill="#162520">TARGETS / 1.85 m</text>
      </svg>
      <div className="scope-vignette" />
    </div>
  </div>
}

function Controls({ full = false }: { full?: boolean }) {
  return <div className={`controls ${full ? 'full-controls' : ''}`}>
    <div><span className="key mouse-key">LMB</span><span>Fire</span></div>
    <div><span className="key mouse-key">RMB</span><span>Scope</span></div>
    <div><span className="key">↕</span><span>Zoom</span></div>
    <div><span className="key">SHIFT</span><span>Hold breath</span></div>
    {full && <><div><span className="key">H</span><span>Show / hide targets</span></div><div><span className="key">F</span><span>Help</span></div><div><span className="key">ESC</span><span>Pause / release mouse</span></div></>}
  </div>
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="webgl-error">Unable to load the 3D scene. Enable hardware acceleration in your browser and reload the page.</div>
    return this.props.children
  }
}

export default function App() {
  const [seed, setSeed] = useState(() => crypto.getRandomValues(new Uint32Array(1))[0])
  const targets = useMemo(() => makeTargets(seed), [seed])
  const [stats, setStats] = useState(() => initialStats(seed))
  const [locked, setLocked] = useState(false)
  const [started, setStarted] = useState(false)
  const [help, setHelp] = useState(false)
  const [markersEnabled, setMarkersEnabled] = useState(true)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const complete = stats.hits.length === TARGET_COUNT
  const active = locked && !complete
  const accuracy = stats.shots ? Math.round(stats.hits.length / stats.shots * 100) : 0
  const toggleMarkers = useCallback(() => setMarkersEnabled(value => !value), [])
  const showHelp = useCallback(() => {
    document.exitPointerLock()
    setHelp(true)
  }, [])

  useEffect(() => {
    const change = () => setLocked(document.pointerLockElement === canvas.current)
    const failure = () => setError('The browser could not lock the mouse. Click again to enter.')
    const blur = () => { if (document.pointerLockElement) document.exitPointerLock() }
    document.addEventListener('pointerlockchange', change)
    document.addEventListener('pointerlockerror', failure)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('pointerlockchange', change)
      document.removeEventListener('pointerlockerror', failure)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useEffect(() => {
    if (complete && document.pointerLockElement) document.exitPointerLock()
  }, [complete])

  const enter = () => {
    setError('')
    setHelp(false)
    setStarted(true)
    resumeAudio()
    const result = canvas.current?.requestPointerLock()
    if (result) void result.catch(() => setError('Click Resume Operation again to lock the mouse.'))
  }
  const newRound = () => {
    let next = crypto.getRandomValues(new Uint32Array(1))[0]
    if (next === seed) next = (seed + 1) >>> 0
    setStats(initialStats(next))
    setMarkers([])
    setSeed(next)
    enter()
  }
  const bearing = stats.scoped ? 'PRECISION OVERWATCH' : 'OBSERVATION POST'
  const windBearing = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(stats.windDirection / 45) % 8]

  return <main className={`game-shell ${stats.scoped && active ? 'is-scoped' : ''} ${active ? 'is-playing' : 'in-menu'}`}>
    <SceneBoundary>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: OBSERVER.toArray(), fov: 55, near: 0.045, far: 2600 }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        onCreated={({ gl }) => { canvas.current = gl.domElement; setReady(true) }}
      >
        <Game key={seed} roundSeed={seed} active={active} targets={targets} markersEnabled={markersEnabled && started} onStats={setStats} onMarkers={setMarkers} onToggleMarkers={toggleMarkers} onHelp={showHelp} />
      </Canvas>
    </SceneBoundary>
    <div className="screen-shade" />
    {stats.scoped && active && <Reticle />}

    <header className="top-bar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); if (locked) document.exitPointerLock() }} aria-label="Highland, game menu">
        <span className="brand-icon"><Icon name="mountain" size={28} /></span>
        <span>HIGHLAND<small>PRECISION SNIPER</small></span>
      </a>
      <div className="location-tag"><span className="live-dot" /><span>PINE VALLEY<small>SECTOR 07 · 1,000 × 1,000 M</small></span></div>
      <div className="session-tag"><span>FREE PRACTICE</span><small>TAKE YOUR TIME. EVERY SHOT COUNTS.</small></div>
    </header>

    {active && <>
      <div className="compass"><span>{Math.round((stats.heading + 315) % 360)}</span><i /><span>{Math.round((stats.heading + 330) % 360)}</span><i /><span>{Math.round((stats.heading + 345) % 360)}</span><i /><strong>{Math.round(stats.heading).toString().padStart(3, '0')}°</strong><i /><span>{Math.round((stats.heading + 15) % 360)}</span><i /><span>{Math.round((stats.heading + 30) % 360)}</span><i /><span>{Math.round((stats.heading + 45) % 360)}</span><b>▾</b></div>
      <div className="mission-card">
        <div className="eyebrow"><span className="live-dot" /> OPERATION HORIZON</div>
        <h2>Clear the sector.</h2>
        <p>Locate and hit the training targets.</p>
        <div className="mission-progress"><Icon name="crosshair" size={17} /><strong>{stats.hits.length.toString().padStart(2, '0')}</strong><span>/ {TARGET_COUNT} TARGETS</span><div className="progress-track"><div style={{ width: `${stats.hits.length / TARGET_COUNT * 100}%` }} /></div></div>
        <div className="mission-meta"><span><Icon name="clock" size={13} /> {formatTime(stats.elapsed)}</span><span>{stats.score.toLocaleString('en-US')} PTS</span></div>
      </div>

      <div className="field-data">
        <span className="eyebrow">{bearing}</span>
        <div className="range"><strong>{stats.distance || '—'}</strong><span>m</span></div>
        <div className="range-label">TARGET RANGE</div>
        <div className="wind">
          <Icon name="wind" size={16} /><span className="wind-speed">{stats.wind.toFixed(1)} m/s</span>
          <span className="wind-direction" aria-label={`Wind blowing toward ${stats.windDirection} degrees`}>
            <span className="wind-arrow" style={{ transform: `rotate(${stats.windDirection - 90}deg)` }}>→</span>
            {stats.windDirection.toString().padStart(3, '0')}° {windBearing}
          </span>
        </div>
        <div className="zero">ZERO <b>300 m</b></div>
        {stats.scoped && <div className="zoom-level"><Icon name="scope" size={17} /><strong>{stats.zoom}×</strong><span>↕ ADJUST</span></div>}
      </div>

      {markersEnabled && <div className="target-markers" aria-hidden="true">
        {markers.map(marker => <div className={`target-marker ${stats.scoped ? 'scope-marker' : ''}`} key={marker.id} style={{ left: marker.x, top: marker.y }}>
          <span className="marker-id">{marker.id.toString().padStart(2, '0')}</span><small>{marker.distance} m</small>
        </div>)}
      </div>}
      {!stats.scoped && <div className="hip-crosshair"><i /><i /><i /><i /><b /></div>}
      {stats.hitFlash > stats.elapsed && <div className="hit-marker">╳</div>}
      {stats.message && <div className={`shot-message ${stats.message === stats.lastHit ? 'success' : ''}`}>{stats.message === stats.lastHit && <Icon name="crosshair" size={17} />}{stats.message}</div>}

      <footer className="bottom-bar">
        <div className="stance"><span className="eyebrow">FIXED POSITION</span><strong>NORTH RIDGE <small>+{Math.round(OBSERVER.y)} m</small></strong><span><span className="live-dot" /> {markersEnabled ? 'TARGET ASSIST' : 'OBSERVATION MODE'} <kbd>H</kbd></span></div>
        <div className="breath-panel"><span>{stats.steady ? 'HOLDING BREATH' : 'AIM STABILITY'} <kbd>SHIFT</kbd></span><div className="breath-track"><div style={{ width: `${stats.breath}%` }} /></div><small>{stats.steady ? 'Steady your aim. Take the opening.' : 'Hold your breath for a precise shot.'}</small></div>
        <div className="ammo-panel"><div className="weapon-label"><span>M24</span><small>7.62 × 51 MM · UNLIMITED SHOTS</small></div><div className="ammo" aria-label="Unlimited ammunition"><strong>∞</strong><span>FREE</span></div></div>
      </footer>
      <div className="playing-hints"><span><kbd>RMB</kbd> SCOPE</span><span><kbd>LMB</kbd> FIRE</span><span><kbd>F</kbd> HELP</span><span><kbd>ESC</kbd> PAUSE</span></div>
    </>}

    {!active && <div className="menu-overlay">
      <section className={`intro-panel ${complete ? 'results-panel' : ''}`}>
        <div className="eyebrow"><span className="line-accent" />{complete ? 'SECTOR CLEARED' : help ? 'FIELD MANUAL' : started ? 'OPERATION PAUSED' : 'ONE VALLEY. ONE SCOPE. YOU.'}</div>
        <h1>{complete ? <>Precision<br /><em>at altitude.</em></> : help ? <>Know<br /><em>your scope.</em></> : started ? <>Breathe.<br /><em>Back on target.</em></> : <>The silence<br /><em>before the shot.</em></>}</h1>
      <p className="intro-copy">{complete ? 'All targets are down. The valley is clear. Start a new round with fresh target positions to test your precision.' : help ? 'Procure as pessoas caminhando nas ruas e florestas. Aguarde uma abertura entre árvores e prédios e antecipe o movimento dos alvos. A mira tem zeragem a 300 m: ajuste a elevação conforme a distância e observe a velocidade e a direção do vento no painel. A seta indica para onde o vento sopra.' : started ? 'Your progress is saved for this round. Return to the observation post when you are ready.' : 'High on the mountain, every detail matters. Track moving figures among the buildings and pines, wait for an opening, and master long-range shooting.'}</p>
      {complete ? <div className="result-grid"><div><strong>{stats.score.toLocaleString('en-US')}</strong><span>SCORE</span></div><div><strong>{accuracy}%</strong><span>ACCURACY</span></div><div><strong>{formatTime(stats.elapsed)}</strong><span>TIME</span></div><div><strong>{stats.shots}</strong><span>SHOTS</span></div></div> : help ? <Controls full /> : <div className="intro-features"><span><Icon name="crosshair" />12 moving targets</span><span><Icon name="scope" />Up to 12× zoom</span><span><Icon name="mountain" />1 km² of terrain</span></div>}
        <button className="start-button" onClick={complete ? newRound : enter} disabled={!ready}>{!ready ? 'PREPARING TERRAIN…' : complete ? 'NEW OPERATION' : started ? 'RESUME OPERATION' : 'TAKE POSITION'}<Icon name="arrow" /></button>
        {error && <p className="input-error" role="alert">{error}</p>}
        {!complete && started && <button className="secondary-button" onClick={newRound}>Restart with new targets <span>↗</span></button>}
        {!help && !complete && <Controls />}
        <div className="intro-note"><Icon name="sound" size={14} /><span>Audio starts when you play · Use headphones for gunfire</span></div>
      </section>
      <div className="map-caption"><span className="caption-line" /><div><span>YOUR OBSERVATION POST</span><strong>North Ridge</strong><small>OVERLOOKING THE CITY AND PARK</small></div><span className="coordinates">07 / N<br />ALT. {Math.round(OBSERVER.y)} M</span></div>
      <div className="menu-footer"><span>HIGHLAND / TRAINING GROUND</span><span>PROCEDURAL TERRAIN · SIMULATED BALLISTICS</span><span>DESKTOP EXPERIENCE</span></div>
    </div>}
  </main>
}
