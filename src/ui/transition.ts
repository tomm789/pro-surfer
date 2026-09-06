/**
 * TV-style scene transition (design doc §11): a skewed wipe sweeps across, the scene switches while
 * the screen is covered, then the wipe clears. Driven by sim time so headless captures are exact.
 */
export type TransitionStyle = 'wipe' | 'fade';

export class Transition {
  private el: HTMLDivElement;
  private edge: HTMLDivElement;
  private t = -1;
  private mid: (() => void) | null = null;
  private fired = false;
  private style: TransitionStyle = 'wipe';
  duration = 0.6;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;inset:0;background:#06131f;pointer-events:none;z-index:60;display:none';
    this.edge = document.createElement('div');
    this.edge.style.cssText = 'position:absolute;top:-20%;bottom:-20%;width:14px;background:linear-gradient(180deg,#3ef0a0,#ffe27a);box-shadow:0 0 24px #3ef0a0;transform:skewX(-14deg)';
    this.el.appendChild(this.edge);
    parent.appendChild(this.el);
  }

  get active(): boolean {
    return this.t >= 0;
  }

  /** Start a transition; `mid` runs once the screen is fully covered. */
  run(mid: () => void, style: TransitionStyle = 'wipe'): void {
    if (this.t >= 0) {
      // already transitioning: chain the switch immediately
      mid();
      return;
    }
    this.style = style;
    this.t = 0;
    this.mid = mid;
    this.fired = false;
    this.el.style.display = 'block';
    this.edge.style.display = style === 'wipe' ? 'block' : 'none';
    this.apply(0);
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const p = Math.min(1, this.t / this.duration);
    if (p >= 0.5 && !this.fired) {
      this.fired = true;
      this.mid?.();
      this.mid = null;
    }
    this.apply(p);
    if (p >= 1) {
      this.t = -1;
      this.el.style.display = 'none';
    }
  }

  private apply(p: number): void {
    if (this.style === 'fade') {
      this.el.style.clipPath = '';
      this.el.style.opacity = String(p < 0.5 ? p * 2 : 2 - p * 2);
      return;
    }
    this.el.style.opacity = '1';
    // cover from the left, then uncover from the left; the leading edge is skewed
    const skew = 12;
    if (p < 0.5) {
      const x = p * 2 * (100 + skew);
      this.el.style.clipPath = `polygon(0 0, ${x}% 0, ${x - skew}% 100%, 0 100%)`;
      this.edge.style.left = `calc(${x - skew / 2}% - 7px)`;
    } else {
      const x = (p - 0.5) * 2 * (100 + skew);
      this.el.style.clipPath = `polygon(${x}% 0, 100% 0, 100% 100%, ${x - skew}% 100%)`;
      this.edge.style.left = `calc(${x - skew / 2}% - 7px)`;
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
