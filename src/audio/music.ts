/**
 * Generative music: a laid-back dub/surf groove (design doc: world / reggae / acoustic rather than punk).
 * A 16-step sequencer at ~84 BPM: kick, rim, hats, offbeat skank chords, a walking dub bass and a
 * pentatonic lead that improvises from a seeded pattern. Entirely synthesised; original composition.
 */
export class Music {
  private out: GainNode;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private bpm = 84;
  private bar = 0;
  private playing = false;
  private lead: number[] = [];
  private chords: number[][] = [];
  private seedState = 1234567;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    volume: number,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = volume;
    // gentle overall low-pass so it sits under the ocean
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    this.out.connect(lp).connect(dest);
    this.compose();
  }

  private rnd(): number {
    this.seedState = (this.seedState * 1664525 + 1013904223) >>> 0;
    return this.seedState / 4294967296;
  }

  private compose(): void {
    // A minor pentatonic-ish lead over a i–VII–VI–VII loop (Am, G, F, G), classic mellow reggae feel
    const am = [220, 261.63, 329.63];
    const g = [196, 246.94, 293.66];
    const f = [174.61, 220, 261.63];
    this.chords = [am, g, f, g];
    const scale = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    this.lead = [];
    for (let i = 0; i < 64; i++) {
      // sparse lead: play on some steps, rests elsewhere
      this.lead.push(this.rnd() < 0.32 ? scale[Math.floor(this.rnd() * scale.length)]! : 0);
    }
  }

  private osc(freq: number, t: number, dur: number, type: OscillatorType, gain: number, attack = 0.01, dest: AudioNode = this.out): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, gain: number, hp: number): void {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(f).connect(g).connect(this.out);
    s.start(t);
  }

  private schedule(step: number, t: number): void {
    const sixteenth = 60 / this.bpm / 4;
    const barStep = step % 16;
    const chord = this.chords[Math.floor(step / 16) % this.chords.length]!;
    // kick on 1 and the "and" of 3 (one-drop feel: heavy on 3)
    if (barStep === 0 || barStep === 8) {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.3);
    }
    // rim/snare on 3
    if (barStep === 8) this.noise(t, 0.12, 0.25, 1800);
    // hats on offbeats
    if (barStep % 4 === 2) this.noise(t, 0.05, 0.12, 6000);
    // skank: chord stabs on the offbeats 2 and 4
    if (barStep === 4 || barStep === 12) for (const f of chord) this.osc(f * 2, t, sixteenth * 1.6, 'triangle', 0.07, 0.004);
    // dub bass: root on 1, fifth on the "and" of 2, root again on 3, octave walk at the end of the bar
    const root = chord[0]! / 2;
    if (barStep === 0) this.osc(root, t, sixteenth * 5, 'sine', 0.32, 0.02);
    if (barStep === 6) this.osc(root * 1.5, t, sixteenth * 2, 'sine', 0.22, 0.02);
    if (barStep === 8) this.osc(root, t, sixteenth * 4, 'sine', 0.3, 0.02);
    if (barStep === 14 && this.bar % 2 === 1) this.osc(root * 2, t, sixteenth * 2, 'sine', 0.2, 0.02);
    // lead: plucked, with a touch of delay via a second quieter hit
    const l = this.lead[step % this.lead.length]!;
    if (l) {
      this.osc(l, t, sixteenth * 2.2, 'triangle', 0.09, 0.005);
      this.osc(l, t + sixteenth * 3, sixteenth * 1.5, 'triangle', 0.035, 0.005);
    }
    if (barStep === 15) this.bar++;
  }

  private tick = (): void => {
    if (!this.playing) return;
    const sixteenth = 60 / this.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += sixteenth;
      this.step++;
    }
    this.timer = window.setTimeout(this.tick, 60);
  };

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.tick();
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  setVolume(v: number): void {
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }
}
