let context: AudioContext | undefined
let shotBuffer: Promise<AudioBuffer> | undefined
let impactBuffer: AudioBuffer | undefined
const shotUrl = new URL('./assets/audio/shot_gun.mp3', import.meta.url).href

function loadShot(audioContext: AudioContext) {
  shotBuffer ??= fetch(shotUrl)
    .then(response => {
      if (!response.ok) throw new Error('Unable to load the gunshot sound.')
      return response.arrayBuffer()
    })
    .then(data => audioContext.decodeAudioData(data))
    .catch(error => {
      shotBuffer = undefined
      throw error
    })
  return shotBuffer
}

export function resumeAudio() {
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  if (!impactBuffer) {
    impactBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.085), context.sampleRate)
    const samples = impactBuffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  }
  // Pré-carrega o disparo ao iniciar para reduzir o atraso do primeiro tiro.
  void loadShot(context).catch(error => console.error('Error loading audio:', error))
}

export function playSound(kind: 'shot' | 'hit') {
  if (!context || context.state !== 'running') return
  if (kind === 'shot') {
    const audioContext = context
    // Cada disparo usa uma fonte própria para permitir sons sobrepostos.
    void loadShot(audioContext).then(buffer => {
      if (audioContext.state !== 'running') return
      const source = audioContext.createBufferSource()
      source.buffer = buffer
      const now = audioContext.currentTime
      const duration = Math.min(0.32, buffer.duration / 1.08)
      const filter = audioContext.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 110
      filter.Q.value = 0.5
      const gain = audioContext.createGain()
      // Preserva o ataque do arquivo e corta a cauda para um disparo mais seco.
      source.playbackRate.value = 1.08
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.85, now + Math.min(0.001, duration / 4))
      gain.gain.exponentialRampToValueAtTime(0.32, now + duration * 0.22)
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
      source.connect(filter)
      filter.connect(gain)
      gain.connect(audioContext.destination)
      source.onended = () => {
        source.disconnect()
        filter.disconnect()
        gain.disconnect()
      }
      source.start(now)
      source.stop(now + duration)
    }).catch(error => console.error('Error playing gunshot:', error))
    return
  }
  const now = context.currentTime
  if (!impactBuffer) return
  const duration = 0.085
  const gain = context.createGain()
  gain.connect(context.destination)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.48, now + 0.001)
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.018)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
  // Ruído curto e uma batida grave substituem o apito por um impacto seco.
  const source = context.createBufferSource()
  source.buffer = impactBuffer
  source.playbackRate.value = 0.95 + Math.random() * 0.1
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1700
  filter.Q.value = 0.65
  source.connect(filter)
  filter.connect(gain)
  source.start(now)
  source.stop(now + duration)
  const oscillator = context.createOscillator()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(180, now)
  oscillator.frequency.exponentialRampToValueAtTime(65, now + 0.045)
  const body = context.createGain()
  body.gain.setValueAtTime(0, now)
  body.gain.linearRampToValueAtTime(0.22, now + 0.001)
  body.gain.exponentialRampToValueAtTime(0.001, now + 0.055)
  oscillator.connect(body)
  body.connect(context.destination)
  oscillator.start()
  oscillator.stop(now + 0.055)
  oscillator.onended = () => {
    oscillator.disconnect()
    body.disconnect()
  }
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
  }
}
