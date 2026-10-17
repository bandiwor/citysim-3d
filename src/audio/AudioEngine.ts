import type { GameConfig } from '../config/gameConfig';
import type { Game } from '../core/Game';
import { AMBIENT_LAYERS, computeMix, type AmbientLayer, type AmbientState } from './mixer';

export type AudioChannel = 'master' | 'ambient' | 'sfx' | 'music';

const CHORDS = [
  [261.63, 329.63, 392.0, 493.88],
  [220.0, 261.63, 329.63, 392.0],
  [174.61, 220.0, 261.63, 329.63],
  [196.0, 246.94, 293.66, 392.0],
];

type Opts = { freq?: number; to?: number; dur?: number; type?: OscillatorType; vol?: number; delay?: number };

/**
 * Процедурный звук без файлов: слоистый эмбиент (город, транспорт, заводы, ветер, птицы, сверчки, вода, сирена),
 * генеративная музыка и звуки действий. Контекст создаётся после первого жеста пользователя (unlock).
 */
export class AudioEngine {
  private _ctx: AudioContext | null = null;
  private _master!: GainNode;
  private _buses = {} as Record<Exclude<AudioChannel, 'master'>, GainNode>;
  private _layers = {} as Record<AmbientLayer, GainNode>;
  private _vol: Record<AudioChannel, number>;
  private _noise!: { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer };
  private _last = new Map<string, number>();
  private _timers = { clank: 0, bird: 0, chord: 0, horn: 0 };
  private _targets = {} as Record<AmbientLayer, number>;
  private _chord = 0;
  private _offs: (() => void)[] = [];

  constructor(private _cfg: GameConfig['audio']) {
    this._vol = { master: _cfg.master, ambient: _cfg.ambient, sfx: _cfg.sfx, music: _cfg.music };
    try {
      const saved = JSON.parse(localStorage.getItem(_cfg.storageKey) ?? 'null') as Partial<Record<AudioChannel, number>> | null;
      if (saved) for (const k of Object.keys(this._vol) as AudioChannel[]) if (typeof saved[k] === 'number') this._vol[k] = saved[k]!;
    } catch {
      /* хранилище недоступно */
    }
  }

  get ready(): boolean {
    return !!this._ctx;
  }

  volume(ch: AudioChannel): number {
    return this._vol[ch];
  }

  setVolume(ch: AudioChannel, v: number): void {
    this._vol[ch] = Math.min(1, Math.max(0, v));
    if (this._ctx) this._applyVolumes();
    try {
      localStorage.setItem(this._cfg.storageKey, JSON.stringify(this._vol));
    } catch {
      /* ignore */
    }
  }

  /** Подписка на события игры: звуки действий, сообщения, доход. */
  attach(game: Game): void {
    this._offs.push(
      game.bus.on('sfx', (e) => this.sfx(e.name)),
      game.bus.on('message', (m) => this.sfx(`msg.${m.kind}`)),
      game.bus.on('speed:changed', () => this.sfx('tick')),
      game.bus.on('overlay:set', () => this.sfx('tick')),
      game.bus.on('tool:set', () => this.sfx('tick')),
    );
  }

  /** Создаёт AudioContext (нужен жест пользователя) и запускает фоновые слои. */
  unlock(): void {
    if (this._ctx) {
      void this._ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this._ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    this._master = ctx.createGain();
    this._master.connect(comp).connect(ctx.destination);
    for (const k of ['ambient', 'sfx', 'music'] as const) {
      this._buses[k] = ctx.createGain();
      this._buses[k].connect(this._master);
    }
    this._noise = { white: this._makeNoise('white'), pink: this._makeNoise('pink'), brown: this._makeNoise('brown') };
    this._buildLayers();
    this._applyVolumes();
    void ctx.resume();
  }

  private _applyVolumes(): void {
    const t = this._ctx!.currentTime;
    this._master.gain.setTargetAtTime(this._vol.master, t, 0.05);
    for (const k of ['ambient', 'sfx', 'music'] as const) this._buses[k].gain.setTargetAtTime(this._vol[k], t, 0.05);
  }

  private _makeNoise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const ctx = this._ctx!;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  private _src(kind: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
    const s = this._ctx!.createBufferSource();
    s.buffer = this._noise[kind];
    s.loop = true;
    s.loopStart = Math.random() * 2;
    s.start();
    return s;
  }

  private _lfo(freq: number, depth: number, target: AudioParam): void {
    const ctx = this._ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
  }

  private _filtered(kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, freq: number, q = 0.7): { out: BiquadFilterNode } {
    const f = this._ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    this._src(kind).connect(f);
    return { out: f };
  }

  private _buildLayers(): void {
    const ctx = this._ctx!;
    const layerGain = (name: AmbientLayer): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this._buses.ambient);
      this._layers[name] = g;
      this._targets[name] = 0;
      return g;
    };

    // город: низкий гул + два расстроенных тона
    const city = layerGain('city');
    const rumble = this._filtered('brown', 'lowpass', 380);
    rumble.out.connect(city);
    for (const f of [55, 82.6]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = f;
      g.gain.value = 0.02;
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      o.connect(lp).connect(g).connect(city);
      o.start();
    }

    // транспорт: шелест шин с медленной модуляцией
    const traffic = layerGain('traffic');
    const tr = this._filtered('pink', 'bandpass', 520, 0.8);
    const trGain = ctx.createGain();
    trGain.gain.value = 0.7;
    tr.out.connect(trGain).connect(traffic);
    this._lfo(0.23, 0.25, trGain.gain);
    this._lfo(0.11, 180, tr.out.frequency);

    // заводы: гул, дрожание и удары (клацанье по таймеру)
    const industry = layerGain('industry');
    const hum = this._filtered('brown', 'lowpass', 170);
    hum.out.connect(industry);
    const saw = ctx.createOscillator();
    const sawG = ctx.createGain();
    const sawLp = ctx.createBiquadFilter();
    saw.type = 'sawtooth';
    saw.frequency.value = 50;
    sawLp.type = 'lowpass';
    sawLp.frequency.value = 160;
    sawG.gain.value = 0.06;
    saw.connect(sawLp).connect(sawG).connect(industry);
    saw.start();
    this._lfo(6, 0.03, sawG.gain);

    // ветер
    const wind = layerGain('wind');
    const w = this._filtered('pink', 'bandpass', 1100, 0.5);
    const wGain = ctx.createGain();
    wGain.gain.value = 0.6;
    w.out.connect(wGain).connect(wind);
    this._lfo(0.17, 0.3, wGain.gain);
    this._lfo(0.07, 400, w.out.frequency);

    // птицы и сверчки — по таймерам/осцилляторам
    layerGain('birds');
    const crick = layerGain('crickets');
    const co = ctx.createOscillator();
    const cg = ctx.createGain();
    co.type = 'sine';
    co.frequency.value = 4300;
    cg.gain.value = 0;
    co.connect(cg).connect(crick);
    co.start();
    this._lfo(11, 0.04, cg.gain);
    const gate = ctx.createOscillator();
    const gateG = ctx.createGain();
    gate.type = 'square';
    gate.frequency.value = 2.3;
    gateG.gain.value = 0.04;
    gate.connect(gateG).connect(cg.gain);
    gate.start();

    // вода
    const water = layerGain('water');
    const wa = this._filtered('brown', 'bandpass', 420, 0.6);
    const waG = ctx.createGain();
    waG.gain.value = 0.9;
    wa.out.connect(waG).connect(water);
    this._lfo(0.4, 0.3, waG.gain);

    // сирена (пожар)
    const siren = layerGain('siren');
    const so = ctx.createOscillator();
    const sg = ctx.createGain();
    const slp = ctx.createBiquadFilter();
    so.type = 'square';
    so.frequency.value = 780;
    sg.gain.value = 0.08;
    slp.type = 'lowpass';
    slp.frequency.value = 1800;
    so.connect(slp).connect(sg).connect(siren);
    so.start();
    this._lfo(1.2, 140, so.frequency);
  }

  /** Вызывать каждый кадр. */
  update(dt: number, state: AmbientState): void {
    const ctx = this._ctx;
    if (!ctx || ctx.state !== 'running') return;
    const mix = computeMix(state);
    const now = ctx.currentTime;
    for (const k of AMBIENT_LAYERS) {
      this._targets[k] = mix[k];
      this._layers[k].gain.setTargetAtTime(mix[k] * 0.9, now, 0.6);
    }
    const paused = state.speed === 0;
    this._timers.clank -= dt;
    this._timers.bird -= dt;
    this._timers.chord -= dt;
    this._timers.horn -= dt;
    if (this._timers.clank <= 0) {
      this._timers.clank = 0.7 + Math.random() * 1.8;
      if (mix.industry > 0.06 && !paused) this._clank(mix.industry);
    }
    if (this._timers.bird <= 0) {
      this._timers.bird = 1.2 + Math.random() * 3.5;
      if (mix.birds > 0.06 && !paused) this._chirp(mix.birds);
    }
    if (this._timers.horn <= 0) {
      this._timers.horn = 3 + Math.random() * 7;
      if (mix.traffic > 0.15 && state.trafficFlow < 0.85 && !paused) this._horn(mix.traffic);
    }
    if (this._timers.chord <= 0) {
      this._timers.chord = 6 + Math.random() * 4;
      this._playChord();
    }
  }

  // ---------- одиночные звуки ----------

  private _tone(bus: GainNode, o: Opts): void {
    const ctx = this._ctx!;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const dur = o.dur ?? 0.15;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq ?? 440, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.2, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private _burst(bus: GainNode, o: { dur: number; from: number; to: number; vol: number; type?: BiquadFilterType; q?: number; delay?: number }): void {
    const ctx = this._ctx!;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this._noise.white;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.from, t0);
    f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t0, Math.random() * 2);
    src.stop(t0 + o.dur + 0.05);
  }

  private _clank(level: number): void {
    const bus = this._buses.ambient;
    this._burst(bus, { dur: 0.12, from: 1400 + Math.random() * 1800, to: 500, vol: 0.18 * level, q: 4 });
    this._tone(bus, { freq: 90 + Math.random() * 40, to: 45, dur: 0.25, vol: 0.2 * level });
  }

  private _chirp(level: number): void {
    const bus = this._buses.ambient;
    const base = 2200 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this._tone(bus, { freq: base, to: base * (1.2 + Math.random() * 0.4), dur: 0.07, vol: 0.05 * level, delay: i * 0.1 });
  }

  private _horn(level: number): void {
    const bus = this._buses.ambient;
    const f = 380 + Math.random() * 120;
    this._tone(bus, { freq: f, dur: 0.22, type: 'square', vol: 0.04 * level });
    this._tone(bus, { freq: f * 1.26, dur: 0.22, type: 'square', vol: 0.03 * level });
  }

  private _playChord(): void {
    if (this._vol.music <= 0.001) return;
    const chord = CHORDS[this._chord++ % CHORDS.length];
    const ctx = this._ctx!;
    for (const [i, f] of chord.entries()) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.35;
      osc.type = i % 2 ? 'triangle' : 'sine';
      osc.frequency.value = f / (i === 0 ? 2 : 1);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.07, t0 + 2.2);
      g.gain.linearRampToValueAtTime(0.0001, t0 + 7);
      osc.connect(g).connect(this._buses.music);
      osc.start(t0);
      osc.stop(t0 + 7.2);
    }
  }

  /** Звук действия по имени. Неизвестные имена игнорируются. */
  sfx(name: string): void {
    const ctx = this._ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = performance.now();
    const gap = name === 'zone' ? 70 : name === 'step' ? 150 : 35;
    if (now - (this._last.get(name) ?? 0) < gap) return;
    this._last.set(name, now);
    const bus = this._buses.sfx;
    switch (name) {
      case 'tick':
        this._tone(bus, { freq: 1300, to: 900, dur: 0.04, vol: 0.08 });
        break;
      case 'road':
        this._burst(bus, { dur: 0.2, from: 900, to: 250, vol: 0.25, type: 'lowpass' });
        this._tone(bus, { freq: 150, to: 70, dur: 0.12, vol: 0.25 });
        break;
      case 'build':
        this._tone(bus, { freq: 110, to: 45, dur: 0.3, vol: 0.4 });
        this._burst(bus, { dur: 0.25, from: 2400, to: 400, vol: 0.2, q: 2 });
        this._tone(bus, { freq: 523, dur: 0.12, vol: 0.12, delay: 0.12, type: 'triangle' });
        this._tone(bus, { freq: 784, dur: 0.18, vol: 0.12, delay: 0.2, type: 'triangle' });
        break;
      case 'zone':
        this._tone(bus, { freq: 600 + Math.random() * 300, dur: 0.05, vol: 0.07, type: 'triangle' });
        break;
      case 'bulldoze':
        this._burst(bus, { dur: 0.35, from: 2600, to: 180, vol: 0.4, type: 'lowpass' });
        this._tone(bus, { freq: 80, to: 35, dur: 0.3, vol: 0.4 });
        break;
      case 'msg.bad':
        this._tone(bus, { freq: 210, to: 150, dur: 0.22, type: 'sawtooth', vol: 0.07 });
        break;
      case 'error':
        this._tone(bus, { freq: 150, dur: 0.12, type: 'square', vol: 0.12 });
        this._tone(bus, { freq: 120, dur: 0.16, type: 'square', vol: 0.12, delay: 0.13 });
        break;
      case 'levelup':
        [523, 659, 784].forEach((f, i) => this._tone(bus, { freq: f, dur: 0.18, vol: 0.1, delay: i * 0.08, type: 'triangle' }));
        break;
      case 'alarm':
        for (let i = 0; i < 4; i++) this._tone(bus, { freq: i % 2 ? 700 : 950, dur: 0.18, type: 'square', vol: 0.1, delay: i * 0.2 });
        break;
      case 'terraform':
        this._burst(bus, { dur: 0.18, from: 700, to: 200, vol: 0.18, type: 'lowpass' });
        this._tone(bus, { freq: 95, to: 60, dur: 0.14, vol: 0.2 });
        break;
      case 'step':
        this._burst(bus, { dur: 0.07, from: 500, to: 180, vol: 0.12, type: 'lowpass' });
        break;
      case 'light':
        this._tone(bus, { freq: 1100, dur: 0.06, vol: 0.1, type: 'square' });
        this._tone(bus, { freq: 800, dur: 0.08, vol: 0.1, type: 'square', delay: 0.07 });
        break;
      case 'stop':
      case 'bus':
        this._tone(bus, { freq: name === 'stop' ? 1500 : 760, dur: 0.35, vol: 0.12 });
        break;
      case 'msg.good':
        this._tone(bus, { freq: 880, dur: 0.12, vol: 0.1, type: 'triangle' });
        this._tone(bus, { freq: 1175, dur: 0.18, vol: 0.1, delay: 0.1, type: 'triangle' });
        break;
      case 'msg.warn':
        this._tone(bus, { freq: 520, dur: 0.18, vol: 0.1, type: 'triangle' });
        break;
      case 'msg.info':
        this._tone(bus, { freq: 990, dur: 0.1, vol: 0.06 });
        break;
      default:
        break;
    }
  }

  dispose(): void {
    for (const f of this._offs) f();
    this._offs = [];
    void this._ctx?.close();
    this._ctx = null;
  }
}
