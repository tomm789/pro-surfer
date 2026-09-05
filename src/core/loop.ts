/**
 * Fixed-timestep accumulator. The simulation always steps at exactly `hz`; the renderer
 * receives an interpolation alpha for smooth motion between sim states.
 */
export interface FixedStepper {
  readonly dt: number;
  /** Feed elapsed wall time; returns number of sim steps executed and the interpolation alpha. */
  advance(elapsedSeconds: number, step: (dt: number) => void): { steps: number; alpha: number };
  reset(): void;
}

export function createFixedStepper(hz: number, maxSubSteps = 4): FixedStepper {
  const dt = 1 / hz;
  let accumulator = 0;
  return {
    dt,
    advance(elapsed, step) {
      // Clamp huge frame gaps (tab switch, debugger) so we never spiral.
      accumulator += Math.min(elapsed, dt * maxSubSteps);
      let steps = 0;
      while (accumulator >= dt && steps < maxSubSteps) {
        step(dt);
        accumulator -= dt;
        steps++;
      }
      if (steps === maxSubSteps && accumulator >= dt) accumulator = 0;
      return { steps, alpha: accumulator / dt };
    },
    reset() {
      accumulator = 0;
    },
  };
}
