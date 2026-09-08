/**
 * Web Audio: procedural ocean ambience, whitewater, spray hiss, UI and trick sounds, plus the music loop.
 * Everything is synthesised (original, no licensed samples). The context starts on the first user gesture.
 */
import { Music } from './music';

function makeNoiseBuffer(ctx: AudioContext, seconds = 2, colour: 'white' | 'brown' | 'pink' = 'brown'): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  let b0 = 0,
    b1 = 0,
    b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (colour === 'white') d[i] = w;
    else if (colour === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
  }
  return buf;
}

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private oceanGain!: GainNode;
  private whiteGain!: GainNode;
  private whiteFilter!: BiquadFilterNode;
  private sprayGain!: GainNode;
  private railGain!: GainNode;
  private railFilter!: BiquadFilterNode;
  music: Music | null = null;
  muted = false;
  private started = false;
  volume = { master: 0.8, music: 0.45, sfx: 0.9, ambience: 0.7 };

  /** Call from a user gesture (keydown/click/gamepad press). Safe to call repeatedly. */
  start(): void {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.started = true;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume.master;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.volume.sfx;
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = this.volume.ambience;
    this.amb.connect(this.master);

    // ocean bed: brown noise through a slow-swelling low-pass
    const ocean = ctx.createBufferSource();
    ocean.buffer = makeNoiseBuffer(ctx, 3, 'brown');
    ocean.loop = true;
    const oceanLp = ctx.createBiquadFilter();
    oceanLp.type = 'lowpass';
    oceanLp.frequency.value = 420;
    this.oceanGain = ctx.createGain();
    this.oceanGain.gain.value = 0.5;
    ocean.connect(oceanLp).connect(this.oceanGain).connect(this.amb);
    ocean.start();
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.11;
    const swellG = ctx.createGain();
    swellG.gain.value = 180;
    swell.connect(swellG).connect(oceanLp.frequency);
    swell.start();

    // whitewater: pink noise band-passed; intensity driven by the sim
    const white = ctx.createBufferSource();
    white.buffer = makeNoiseBuffer(ctx, 2.5, 'pink');
    white.loop = true;
    this.whiteFilter = ctx.createBiquadFilter();
    this.whiteFilter.type = 'bandpass';
    this.whiteFilter.frequency.value = 900;
    this.whiteFilter.Q.value = 0.6;
    this.whiteGain = ctx.createGain();
    this.whiteGain.gain.value = 0;
    white.connect(this.whiteFilter).connect(this.whiteGain).connect(this.amb);
    white.start();

    // spray / rail hiss: white noise high-passed
    const spray = ctx.createBufferSource();
    spray.buffer = makeNoiseBuffer(ctx, 1.5, 'white');
    spray.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    this.sprayGain = ctx.createGain();
    this.sprayGain.gain.value = 0;
    spray.connect(hp).connect(this.sprayGain).connect(this.amb);
    spray.start();

    // rail bite: a lower, throatier hiss that rises with how much rail is buried (docs/MECHANICS.md §7)
    const rail = ctx.createBufferSource();
    rail.buffer = makeNoiseBuffer(ctx, 2, 'pink');
    rail.loop = true;
    this.railFilter = ctx.createBiquadFilter();
    this.railFilter.type = 'bandpass';
    this.railFilter.frequency.value = 1400;
    this.railFilter.Q.value = 1.1;
    this.railGain = ctx.createGain();
    this.railGain.gain.value = 0;
    rail.connect(this.railFilter).connect(this.railGain).connect(this.amb);
    rail.start();

    this.music = new Music(ctx, this.master, this.volume.music);
    if (ctx.state === 'suspended') void ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume.master, this.ctx.currentTime, 0.05);
  }

  /**
   * Per-frame ambience control. whitewater 0..1, spray 0..1, insideTube 0..1 (muffles),
   * railBite 0..1 (how much rail is buried: the carve hiss), speed01 lifts the pitch of the hiss.
   */
  ambience(whitewater: number, spray: number, insideTube: number, railBite = 0, speed01 = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.whiteGain.gain.setTargetAtTime(Math.min(1, whitewater) * 0.55, t, 0.15);
    this.whiteFilter.frequency.setTargetAtTime(900 - insideTube * 500, t, 0.2);
    this.sprayGain.gain.setTargetAtTime(Math.min(1, spray) * 0.18, t, 0.08);
    this.oceanGain.gain.setTargetAtTime(0.5 + insideTube * 0.5, t, 0.2);
    this.railGain.gain.setTargetAtTime(Math.min(1, railBite) * 0.34 * (0.5 + 0.5 * speed01), t, 0.06);
    this.railFilter.frequency.setTargetAtTime(1000 + speed01 * 900 + railBite * 400, t, 0.1);
  }

  /** The pop: a loaded crouch released at the lip. A thump under a short slap of spray. */
  pop(power = 1): void {
    this.tone(90 + power * 40, 0.16, 'sine', 0.3 * power, 45);
    this.burst(0.18, 0.35 * power, 2600, 0.6);
  }

  /** A turn the recogniser named; worth scales the flourish so a roundhouse sounds bigger than a carve. */
  turnNamed(worth: number): void {
    const base = 440 + Math.min(2, worth) * 120;
    this.tone(base, 0.07, 'triangle', 0.1, base * 1.25);
    if (worth >= 1.3) setTimeout(() => this.tone(base * 1.5, 0.12, 'triangle', 0.12, base * 2), 70);
  }

  /** The tail breaking loose: a scrub of noise, longer the further it slides. */
  slide(amount = 1): void {
    this.burst(0.2 + amount * 0.25, 0.28, 1700, 0.5);
  }

  /** The pool's lap horn: a low two-tone blast as the carriage starts its run. */
  horn(): void {
    this.tone(196, 0.55, 'sawtooth', 0.16, 190);
    this.tone(247, 0.55, 'sawtooth', 0.12, 240);
    setTimeout(() => {
      this.tone(196, 0.7, 'sawtooth', 0.16, 185);
      this.tone(294, 0.7, 'sawtooth', 0.1, 290);
    }, 650);
  }

  /** A zone callout on the pool: two soft notes, rising for a barrel section, falling for a ramp. */
  zone(kind: 'barrel' | 'ramp'): void {
    const [a, b] = kind === 'barrel' ? [523, 784] : [659, 523];
    this.tone(a, 0.1, 'sine', 0.14);
    setTimeout(() => this.tone(b, 0.16, 'sine', 0.14), 110);
  }

  private tone(freq: number, seconds: number, type: OscillatorType, gain = 0.25, slideTo?: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + seconds);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + seconds + 0.02);
  }

  private burst(seconds: number, gain: number, freq: number, q = 1): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = makeNoiseBuffer(this.ctx, Math.max(0.2, seconds), 'white');
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t);
    s.stop(t + seconds + 0.02);
  }

  uiMove(): void {
    this.tone(880, 0.06, 'square', 0.08);
  }
  uiSelect(): void {
    this.tone(660, 0.09, 'triangle', 0.18, 990);
  }
  uiBack(): void {
    this.tone(440, 0.1, 'triangle', 0.14, 330);
  }
  trick(): void {
    this.tone(520, 0.09, 'triangle', 0.14, 780);
  }
  special(): void {
    this.tone(660, 0.18, 'sawtooth', 0.12, 1320);
    this.tone(990, 0.28, 'triangle', 0.1, 1980);
  }
  perfect(): void {
    this.tone(784, 0.12, 'triangle', 0.2, 1175);
    this.tone(1175, 0.2, 'triangle', 0.14, 1568);
  }
  sloppy(): void {
    this.tone(330, 0.16, 'square', 0.1, 260);
  }
  launch(): void {
    this.burst(0.35, 0.3, 3200, 0.7);
  }
  land(): void {
    this.burst(0.25, 0.5, 900, 0.8);
  }
  wipeout(): void {
    this.burst(1.1, 0.7, 500, 0.5);
    this.tone(200, 0.4, 'sawtooth', 0.12, 60);
  }
  bank(total: number): void {
    const n = Math.min(6, 2 + Math.floor(Math.log10(Math.max(10, total))));
    for (let i = 0; i < n; i++) setTimeout(() => this.tone(523 * Math.pow(1.19, i), 0.12, 'triangle', 0.16), i * 55);
  }
  meterFull(): void {
    this.tone(440, 0.3, 'sawtooth', 0.1, 880);
    this.burst(0.3, 0.15, 6000, 0.5);
  }
  tubeEnter(): void {
    this.tone(160, 0.5, 'sine', 0.2, 80);
  }
  spit(): void {
    this.burst(0.6, 0.6, 2200, 0.4);
  }
  warning(): void {
    this.tone(1046, 0.08, 'square', 0.1);
    setTimeout(() => this.tone(1046, 0.08, 'square', 0.1), 130);
  }
  countdownBeep(final = false): void {
    this.tone(final ? 1568 : 1046, final ? 0.25 : 0.1, 'square', 0.12);
  }
  shutter(): void {
    this.burst(0.12, 0.5, 4500, 0.9);
  }
}
