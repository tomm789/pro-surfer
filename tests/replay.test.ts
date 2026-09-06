import { describe, expect, it } from 'vitest';
import { HighlightTracker, InputRecorder, ReplayPlayer, type Recording } from '@/core/replay';
import { NEUTRAL_INPUT, cloneInput, type RiderInput } from '@/rider/input';
import { TUNING } from '@/core/tuning';
import { WaveModel, waveParamsFromBeach } from '@/wave/wave';
import { getBeach } from '@/world/beaches';
import { waveFeetToMetres } from '@/world/beach';
import { RiderSim, type RiderEvents } from '@/rider/rider';
import { EventBus } from '@/core/events';
import { Rng } from '@/core/rng';

function rec(keys: Recording['keys'], frames: number): Recording {
  return { hz: 60, seed: 1, params: '', keys, frames, highlight: null };
}

describe('input recorder / player', () => {
  it('stores only changes and plays them back frame-exact', () => {
    const r = new InputRecorder();
    const a = { ...NEUTRAL_INPUT, stickY: 1 };
    for (let f = 0; f < 10; f++) r.record(f < 4 ? NEUTRAL_INPUT : a, f === 7);
    expect(r.frames).toBe(10);
    expect(r.keys.map((k) => k.f)).toEqual([0, 4, 7]);
    const p = new ReplayPlayer(rec(r.keys, r.frames));
    expect(p.inputAt(0).input.stickY).toBe(0);
    expect(p.inputAt(3).input.stickY).toBe(0);
    expect(p.inputAt(5).input.stickY).toBe(1);
    expect(p.inputAt(6).cashIn).toBe(false);
    expect(p.inputAt(7).cashIn).toBe(true);
    expect(p.inputAt(8).cashIn).toBe(false);
    expect(p.inputAt(8).input.stickY).toBe(1);
  });

  it('re-simulating the recorded inputs reproduces the rider exactly', () => {
    const run = (playback: ReplayPlayer | null) => {
      const wave = new WaveModel(waveParamsFromBeach(getBeach('sandbar'), waveFeetToMetres(8), { warnSeconds: 2 }), new Rng(5), 0);
      const rider = new RiderSim(wave, TUNING, { spin: 0.5, speed: 0.5, air: 0.5, balance: 0.5 }, new EventBus<RiderEvents>(), undefined, new Rng(12));
      const recorder = new InputRecorder();
      const rng = new Rng(99);
      for (let f = 0; f < 600; f++) {
        let input: Readonly<RiderInput> = NEUTRAL_INPUT;
        if (playback) input = playback.inputAt(f).input;
        else {
          const live = cloneInput(NEUTRAL_INPUT);
          if (f > 60) live.stand = true;
          if (f > 120) live.stickY = rng.next() > 0.3 ? 1 : 0;
          if (f > 200 && f % 90 < 20) live.jump = true;
          if (f > 300 && f % 130 < 40) live.stickX = 1;
          input = live;
          recorder.record(input, false);
        }
        wave.step(1 / 60, rider.state === 'wipeout' ? null : rider.u);
        rider.step(1 / 60, input);
      }
      return { snap: rider.snapshot(), recorder };
    };
    const first = run(null);
    const second = run(new ReplayPlayer(rec(first.recorder.keys, first.recorder.frames)));
    expect(second.snap).toEqual(first.snap);
  });
});

describe('highlight tracker', () => {
  it('keeps the window of the best chain with lead-in and tail', () => {
    const h = new HighlightTracker();
    for (let f = 0; f < 100; f++) h.step(f, f >= 40);
    h.bank(100, 5000, 60, 30);
    expect(h.best).toEqual({ startFrame: 0, endFrame: 130, points: 5000 });
    for (let f = 100; f < 400; f++) h.step(f, f >= 300);
    h.bank(400, 2000, 60, 30);
    expect(h.best!.points).toBe(5000);
    h.bank(400, 9000, 60, 30);
    expect(h.best).toEqual({ startFrame: 240, endFrame: 430, points: 9000 });
  });
});
