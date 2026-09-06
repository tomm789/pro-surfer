/**
 * Populated wave (design doc §3.2): hazards and goal targets sharing the wave. Sim-side only.
 * Objects sit at a fixed u on the face (or in front of the trough) and are sprayed, splashed, smashed
 * or jumped by the rider. Solid objects (pier, jet-ski) wipe you out on contact.
 */
import type { Rng } from '@/core/rng';
import type { EventBus } from '@/core/events';

export type ObjectKind = 'windsurfer' | 'tuber' | 'kayak' | 'jetski' | 'sponger' | 'turtle' | 'rafter' | 'pier' | 'ice';
export type HitAction = 'spray' | 'splash' | 'smash' | 'jump';

export interface WaveObject {
  id: number;
  kind: ObjectKind;
  u: number;
  v: number;
  /** Radius for interactions, metres. */
  radius: number;
  solid: boolean;
  hit: HitAction | null;
  /** Seconds since hit (for the tumble animation). */
  hitTime: number;
  /** Drift along u (m/s), e.g. a windsurfer moving. */
  driftU: number;
}

export interface ObjectEvents extends Record<string, unknown> {
  objectHit: { object: WaveObject; action: HitAction };
  objectCollision: { object: WaveObject };
  objectSpawn: { object: WaveObject };
}

const KIND_DEFS: Record<ObjectKind, { radius: number; solid: boolean; v: [number, number]; drift: number }> = {
  windsurfer: { radius: 2.2, solid: false, v: [0.05, 0.2], drift: 1.5 },
  tuber: { radius: 1.2, solid: false, v: [0.03, 0.15], drift: 0 },
  kayak: { radius: 1.8, solid: false, v: [0.03, 0.2], drift: 0.8 },
  jetski: { radius: 2.4, solid: true, v: [0.03, 0.1], drift: 2.5 },
  sponger: { radius: 1.1, solid: false, v: [0.1, 0.4], drift: 0 },
  turtle: { radius: 0.8, solid: false, v: [0.03, 0.25], drift: 0 },
  rafter: { radius: 1.6, solid: false, v: [0.03, 0.15], drift: 0 },
  pier: { radius: 1.0, solid: true, v: [0, 1], drift: 0 },
  ice: { radius: 1.5, solid: true, v: [0.03, 0.3], drift: 0 },
};

export class ObjectField {
  readonly objects: WaveObject[] = [];
  private nextId = 1;
  private timer: number;
  hits: Record<string, number> = {};

  constructor(
    private kinds: ObjectKind[],
    private rng: Rng,
    private events: EventBus<ObjectEvents>,
    private intervalSeconds = 22,
  ) {
    this.timer = intervalSeconds * 0.5;
  }

  count(kind: string, action: string): number {
    return this.hits[`${kind}:${action}`] ?? 0;
  }

  private record(o: WaveObject, action: HitAction): void {
    o.hit = action;
    o.hitTime = 0;
    const k = `${o.kind}:${action}`;
    this.hits[k] = (this.hits[k] ?? 0) + 1;
    this.events.emit('objectHit', { object: o, action });
  }

  spawn(kind: ObjectKind, u: number, v?: number): WaveObject {
    const def = KIND_DEFS[kind];
    const o: WaveObject = {
      id: this.nextId++,
      kind,
      u,
      v: v ?? this.rng.range(def.v[0], def.v[1]),
      radius: def.radius,
      solid: def.solid,
      hit: null,
      hitTime: 0,
      driftU: def.drift * (this.rng.chance(0.5) ? 1 : -1),
    };
    this.objects.push(o);
    this.events.emit('objectSpawn', { object: o });
    return o;
  }

  /**
   * @param riderU rider position along the crest; @param riderV on the face; @param airborne in the air
   * @param carving carve held with lean; @param justLanded landed this step; @param curlU whitewater edge
   */
  step(dt: number, riderU: number, riderV: number, airborne: boolean, carving: boolean, justLanded: boolean, curlU: number, riderSpeed: number): void {
    if (this.kinds.length) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer += this.intervalSeconds * this.rng.range(0.8, 1.3);
        const kind = this.rng.pick(this.kinds);
        this.spawn(kind, riderU + this.rng.range(28, 48));
      }
    }
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i]!;
      if (o.hit) o.hitTime += dt;
      o.u += o.driftU * dt;
      // swallowed by the whitewater → gone
      if (o.u < curlU - 3 || o.u < riderU - 60) {
        this.objects.splice(i, 1);
        continue;
      }
      const du = o.u - riderU;
      const dist = Math.hypot(du, (o.v - riderV) * 4);
      if (o.hit) continue;
      if (airborne) {
        if (Math.abs(du) < o.radius + 0.8) this.record(o, 'jump');
        continue;
      }
      if (justLanded && dist < o.radius + 2.5) {
        this.record(o, 'splash');
        continue;
      }
      if (dist < o.radius * 0.7 && riderSpeed > 3) {
        if (o.solid) {
          o.hit = 'smash';
          this.events.emit('objectCollision', { object: o });
        } else this.record(o, 'smash');
        continue;
      }
      if (carving && dist < o.radius + 2.5) this.record(o, 'spray');
    }
  }

  /** Nearest object ahead within range, for the hazard sign and object cam. */
  nearestAhead(riderU: number, range = 30): WaveObject | null {
    let best: WaveObject | null = null;
    for (const o of this.objects) {
      const du = o.u - riderU;
      if (du < -3 || du > range) continue;
      if (!best || du < best.u - riderU) best = o;
    }
    return best;
  }
}
