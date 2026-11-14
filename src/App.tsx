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
        <text x="325" y="810" fontFamily="monospace" fontSize="12" fill="#162520">ALVOS / 1.85 m</text>
      </svg>
      <div className="scope-vignette" />
    </div>
  </div>
}

function Controls({ full = false }: { full?: boolean }) {
  return <div className={`controls ${full ? 'full-controls' : ''}`}>
    <div><span className="key mouse-key">LMB</span><span>Atirar</span></div>
    <div><span className="key mouse-key">RMB</span><span>Mira telescópica</span></div>
    <div><span className="key">↕</span><span>Zoom</span></div>
    <div><span className="key">SHIFT</span><span>Segurar respiração</span></div>
    {full && <><div><span className="key">H</span><span>Mostrar / ocultar alvos</span></div><div><span className="key">F</span><span>Ajuda</span></div><div><span className="key">ESC</span><span>Pausar / liberar mouse</span></div></>}
  </div>
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="webgl-error">Não foi possível iniciar o cenário 3D. Ative a aceleração de hardware do navegador e recarregue a página.</div>
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
    const failure = () => setError('O navegador não capturou o mouse. Clique novamente para entrar.')
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
    if (result) void result.catch(() => setError('Clique novamente em continuar para capturar o mouse.'))
  }
  const newRound = () => {
    let next = crypto.getRandomValues(new Uint32Array(1))[0]
    if (next === seed) next = (seed + 1) >>> 0
    setStats(initialStats(next))
    setMarkers([])
    setSeed(next)
    enter()
  }
  const bearing = stats.scoped ? 'OBSERVAÇÃO DE PRECISÃO' : 'POSTO DE OBSERVAÇÃO'
  const windBearing = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(stats.windDirection / 45) % 8]

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
      <a className="brand" href="#" onClick={event => { event.preventDefault(); if (locked) document.exitPointerLock() }} aria-label="Highland, menu do jogo">
        <span className="brand-icon"><Icon name="mountain" size={28} /></span>
        <span>HIGHLAND<small>SNIPER DE PRECISÃO</small></span>
      </a>
      <div className="location-tag"><span className="live-dot" /><span>VALE DO PINHEIRO<small>SETOR 07 · 1.000 × 1.000 M</small></span></div>
      <div className="session-tag"><span>TREINO LIVRE</span><small>SEM PRESSA. CADA TIRO CONTA.</small></div>
    </header>

    {active && <>
      <div className="compass"><span>{Math.round((stats.heading + 315) % 360)}</span><i /><span>{Math.round((stats.heading + 330) % 360)}</span><i /><span>{Math.round((stats.heading + 345) % 360)}</span><i /><strong>{Math.round(stats.heading).toString().padStart(3, '0')}°</strong><i /><span>{Math.round((stats.heading + 15) % 360)}</span><i /><span>{Math.round((stats.heading + 30) % 360)}</span><i /><span>{Math.round((stats.heading + 45) % 360)}</span><b>▾</b></div>
      <div className="mission-card">
        <div className="eyebrow"><span className="live-dot" /> OPERAÇÃO HORIZONTE</div>
        <h2>Limpe o setor.</h2>
        <p>Localize e acerte os alvos de treino.</p>
        <div className="mission-progress"><Icon name="crosshair" size={17} /><strong>{stats.hits.length.toString().padStart(2, '0')}</strong><span>/ {TARGET_COUNT} ALVOS</span><div className="progress-track"><div style={{ width: `${stats.hits.length / TARGET_COUNT * 100}%` }} /></div></div>
        <div className="mission-meta"><span><Icon name="clock" size={13} /> {formatTime(stats.elapsed)}</span><span>{stats.score.toLocaleString('pt-BR')} PTS</span></div>
      </div>

      <div className="field-data">
        <span className="eyebrow">{bearing}</span>
        <div className="range"><strong>{stats.distance || '—'}</strong><span>m</span></div>
        <div className="range-label">DISTÂNCIA DA MIRA</div>
        <div className="wind">
          <Icon name="wind" size={16} /><span className="wind-speed">{stats.wind.toFixed(1)} m/s</span>
          <span className="wind-direction" aria-label={`Vento soprando para ${stats.windDirection} graus`}>
            <span className="wind-arrow" style={{ transform: `rotate(${stats.windDirection - 90}deg)` }}>→</span>
            {stats.windDirection.toString().padStart(3, '0')}° {windBearing}
          </span>
        </div>
        <div className="zero">ZERAGEM <b>300 m</b></div>
        {stats.scoped && <div className="zoom-level"><Icon name="scope" size={17} /><strong>{stats.zoom}×</strong><span>↕ AJUSTAR</span></div>}
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
        <div className="stance"><span className="eyebrow">POSIÇÃO FIXA</span><strong>CRISTA NORTE <small>+{Math.round(OBSERVER.y)} m</small></strong><span><span className="live-dot" /> {markersEnabled ? 'ALVOS ASSISTIDOS' : 'MODO OBSERVAÇÃO'} <kbd>H</kbd></span></div>
        <div className="breath-panel"><span>{stats.steady ? 'RESPIRAÇÃO PRESA' : 'ESTABILIDADE DA MIRA'} <kbd>SHIFT</kbd></span><div className="breath-track"><div style={{ width: `${stats.breath}%` }} /></div><small>{stats.steady ? 'Mantenha a mira. Aproveite a janela.' : 'Segure a respiração para um tiro preciso.'}</small></div>
        <div className="ammo-panel"><div className="weapon-label"><span>M24</span><small>7.62 × 51 MM · TIROS ILIMITADOS</small></div><div className="ammo" aria-label="Munição infinita"><strong>∞</strong><span>LIVRE</span></div></div>
      </footer>
      <div className="playing-hints"><span><kbd>RMB</kbd> MIRA</span><span><kbd>LMB</kbd> DISPARAR</span><span><kbd>F</kbd> AJUDA</span><span><kbd>ESC</kbd> PAUSAR</span></div>
    </>}

    {!active && <div className="menu-overlay">
      <section className={`intro-panel ${complete ? 'results-panel' : ''}`}>
        <div className="eyebrow"><span className="line-accent" />{complete ? 'SETOR CONCLUÍDO' : help ? 'MANUAL DE CAMPO' : started ? 'OPERAÇÃO EM PAUSA' : 'UM VALE. UMA MIRA. VOCÊ.'}</div>
        <h1>{complete ? <>Precisão<br /><em>em altitude.</em></> : help ? <>Conheça<br /><em>sua mira.</em></> : started ? <>Respire.<br /><em>Volte ao alvo.</em></> : <>O silêncio antes<br /><em>do disparo.</em></>}</h1>
      <p className="intro-copy">{complete ? 'Todos os alvos foram abatidos. O vale está limpo. Uma nova rodada traz novas posições para desafiar sua precisão.' : help ? 'Procure figuras humanas caminhando pelas ruas e pela floresta. Elas podem se esconder atrás de árvores e prédios: espere uma abertura e antecipe o movimento. A mira está zerada a 300 metros; ajuste a elevação e consulte a velocidade e a direção do vento no painel. A seta indica para onde ele sopra.' : started ? 'Seu progresso está salvo nesta rodada. Volte ao posto de observação quando estiver pronto.' : 'No alto da montanha, cada detalhe importa. Observe figuras em movimento entre os prédios e pinheiros, espere uma abertura e domine o tiro a longa distância.'}</p>
      {complete ? <div className="result-grid"><div><strong>{stats.score.toLocaleString('pt-BR')}</strong><span>PONTUAÇÃO</span></div><div><strong>{accuracy}%</strong><span>PRECISÃO</span></div><div><strong>{formatTime(stats.elapsed)}</strong><span>TEMPO</span></div><div><strong>{stats.shots}</strong><span>DISPAROS</span></div></div> : help ? <Controls full /> : <div className="intro-features"><span><Icon name="crosshair" />12 alvos móveis</span><span><Icon name="scope" />Mira até 12×</span><span><Icon name="mountain" />1 km² de terreno</span></div>}
        <button className="start-button" onClick={complete ? newRound : enter} disabled={!ready}>{!ready ? 'PREPARANDO O TERRENO…' : complete ? 'NOVA OPERAÇÃO' : started ? 'CONTINUAR OPERAÇÃO' : 'ASSUMIR POSIÇÃO'}<Icon name="arrow" /></button>
        {error && <p className="input-error" role="alert">{error}</p>}
        {!complete && started && <button className="secondary-button" onClick={newRound}>Reiniciar com novos alvos <span>↗</span></button>}
        {!help && !complete && <Controls />}
        <div className="intro-note"><Icon name="sound" size={14} /><span>Áudio ligado ao iniciar · Use fones para os disparos</span></div>
      </section>
      <div className="map-caption"><span className="caption-line" /><div><span>SEU POSTO DE OBSERVAÇÃO</span><strong>Crista Norte</strong><small>VISTA PARA A CIDADE E O PARQUE</small></div><span className="coordinates">07 / N<br />ALT. {Math.round(OBSERVER.y)} M</span></div>
      <div className="menu-footer"><span>HIGHLAND / CAMPO DE TREINO</span><span>TERRENO PROCEDURAL · BALÍSTICA SIMULADA</span><span>EXPERIÊNCIA PARA COMPUTADOR</span></div>
    </div>}
  </main>
}
