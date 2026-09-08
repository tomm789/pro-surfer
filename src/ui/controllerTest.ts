/**
 * Controller test screen: what the pad is actually sending, live, so a stick scheme can be verified
 * before a session. Two stick pads (raw axes and the deadzoned feet), the five stance quantities the
 * simulation derives from them (docs/MECHANICS.md §2), every button as it is held, and the pad's id.
 * Works from the keyboard too via the dual keymap, so the screen doubles as a key-map reference.
 */
import { TUNING } from '@/core/tuning';
import { NEUTRAL_INPUT, type RiderInput } from '@/rider/input';
import { StanceModel } from '@/rider/stance';
import { ensureScreenCss, MenuNav } from './screens';

const CSS = `
.ctest .pads{display:flex;gap:28px;justify-content:center;margin:8px 0 14px}
.ctest .pad{width:150px;text-align:center;font-size:12px;letter-spacing:2px;color:#9fd8e8}
.ctest .pad .ring{position:relative;width:130px;height:130px;margin:0 auto 6px;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:radial-gradient(circle,rgba(255,255,255,.06),rgba(0,0,0,.25))}
.ctest .pad .ring:before,.ctest .pad .ring:after{content:'';position:absolute;background:rgba(255,255,255,.14)}
.ctest .pad .ring:before{left:50%;top:6px;bottom:6px;width:1px}
.ctest .pad .ring:after{top:50%;left:6px;right:6px;height:1px}
.ctest .pad .dz{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px;border-radius:50%;border:1px dashed rgba(255,255,255,.25)}
.ctest .pad .raw{position:absolute;width:10px;height:10px;margin:-5px;border-radius:50%;background:rgba(255,255,255,.35)}
.ctest .pad .dot{position:absolute;width:18px;height:18px;margin:-9px;border-radius:50%;background:#3ef0a0;box-shadow:0 0 10px #3ef0a0}
.ctest .pad .val{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#fff;letter-spacing:0}
.ctest .q{display:grid;grid-template-columns:110px 1fr 60px;gap:6px 12px;align-items:center;font-size:14px;margin:0 auto 12px;max-width:520px}
.ctest .q .bar{position:relative;height:10px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden}
.ctest .q .bar i{position:absolute;top:0;bottom:0;left:50%;background:#7ff2e6}
.ctest .q .bar.pos i{background:#ffb56b}
.ctest .q .n{font-family:ui-monospace,Menlo,monospace;text-align:right;color:#fff}
.ctest .btns{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:620px;margin:0 auto 10px}
.ctest .btn{padding:4px 9px;border-radius:6px;border:1px solid rgba(255,255,255,.3);font-size:12px;letter-spacing:1px;color:#c9e6f5;transition:background .08s,color .08s}
.ctest .btn.on{background:#3ef0a0;color:#062;border-color:#3ef0a0}
.ctest .id{font-size:12px;color:#9fd8e8;text-align:center;margin-bottom:6px;max-width:640px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

const BUTTONS: { key: keyof RiderInput; label: string }[] = [
  { key: 'jump', label: 'A · jump' },
  { key: 'grab', label: 'B/K · grab' },
  { key: 'carve', label: 'X/J · carve' },
  { key: 'slide', label: 'Y/L · slide' },
  { key: 'spinLeft', label: 'LB/Q · spin L' },
  { key: 'spinRight', label: 'RB/E · spin R' },
  { key: 'cameraToggle', label: 'LT/Shift · camera' },
  { key: 'objectCam', label: 'RT · object cam' },
  { key: 'cashIn', label: 'R3/Enter · cash in' },
  { key: 'pause', label: 'Start/Esc · pause' },
  { key: 'stand', label: 'stand' },
  { key: 'duckDive', label: 'duck dive' },
];

const QUANTITIES: { key: 'compression' | 'trim' | 'rail' | 'twist' | 'pumpWork'; label: string; hint: string }[] = [
  { key: 'compression', label: 'compression', hint: 'both down = crouch' },
  { key: 'trim', label: 'trim', hint: 'nose pressed = drive' },
  { key: 'rail', label: 'rail', hint: 'both lean = carve' },
  { key: 'twist', label: 'twist', hint: 'opposite = pivot' },
  { key: 'pumpWork', label: 'pump', hint: 'extend while climbing' },
];

let cssDone = false;

export class ControllerTestScreen {
  readonly root: HTMLDivElement;
  private nav = new MenuNav();
  onBack: (() => void) | null = null;
  private stance = new StanceModel(TUNING);
  private dots: { raw: HTMLDivElement; dot: HTMLDivElement; val: HTMLDivElement }[] = [];
  private bars: { fill: HTMLElement; bar: HTMLElement; n: HTMLElement }[] = [];
  private btns: HTMLDivElement[] = [];
  private idEl: HTMLDivElement;
  private timer = 0;
  private padName: () => string;

  constructor(parent: HTMLElement, padName: () => string) {
    ensureScreenCss();
    if (!cssDone) {
      const s = document.createElement('style');
      s.textContent = CSS;
      document.head.appendChild(s);
      cssDone = true;
    }
    this.padName = padName;
    this.root = document.createElement('div');
    this.root.className = 'scr dim ctest';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = '<h1>CONTROLLER TEST</h1>';
    this.idEl = document.createElement('div');
    this.idEl.className = 'id';
    panel.appendChild(this.idEl);

    const pads = document.createElement('div');
    pads.className = 'pads';
    for (const name of ['BACK FOOT · left stick', 'FRONT FOOT · right stick']) {
      const pad = document.createElement('div');
      pad.className = 'pad';
      const ring = document.createElement('div');
      ring.className = 'ring';
      const dz = document.createElement('div');
      dz.className = 'dz';
      const raw = document.createElement('div');
      raw.className = 'raw';
      const dot = document.createElement('div');
      dot.className = 'dot';
      ring.append(dz, raw, dot);
      const label = document.createElement('div');
      label.textContent = name;
      const val = document.createElement('div');
      val.className = 'val';
      pad.append(ring, label, val);
      pads.appendChild(pad);
      this.dots.push({ raw, dot, val });
    }
    panel.appendChild(pads);

    const q = document.createElement('div');
    q.className = 'q';
    for (const item of QUANTITIES) {
      const l = document.createElement('div');
      l.textContent = item.label;
      l.title = item.hint;
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('i');
      bar.appendChild(fill);
      const n = document.createElement('div');
      n.className = 'n';
      q.append(l, bar, n);
      this.bars.push({ fill, bar, n });
    }
    panel.appendChild(q);

    const btns = document.createElement('div');
    btns.className = 'btns';
    for (const b of BUTTONS) {
      const d = document.createElement('div');
      d.className = 'btn';
      d.textContent = b.label;
      btns.appendChild(d);
      this.btns.push(d);
    }
    panel.appendChild(btns);

    const foot = document.createElement('div');
    foot.className = 'foot';
    foot.textContent = 'Move the sticks and press everything · keyboard: WASD back foot, arrows front foot · hold B / Esc to go back';
    panel.appendChild(foot);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.render(NEUTRAL_INPUT);
  }

  prime(input: Readonly<RiderInput>): void {
    this.nav.prime(input);
    this.timer = 0;
  }

  /** Feed the live input each frame. Back is a held press so a tap on a button under test never leaves the screen. */
  update(input: Readonly<RiderInput>, dt: number, direction: 1 | -1 = 1): void {
    this.stance.update(dt, input, direction, 0);
    this.render(input);
    this.nav.read(input, dt);
    if (input.grab || input.pause) this.timer += dt;
    else this.timer = 0;
    if (this.timer > 0.6) {
      this.timer = -10; // fire once
      this.onBack?.();
    }
  }

  private render(input: Readonly<RiderInput>): void {
    this.idEl.textContent = this.padName() || 'No gamepad seen yet · keyboard only';
    const feet: [number, number, number, number][] = [
      [input.backX, input.backY, input.backX, input.backY],
      [input.frontX, input.frontY, input.frontX, input.frontY],
    ];
    // raw axes straight from the pad, when one is connected, so the deadzone is visible as the gap
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    if (gp) {
      feet[0]![2] = gp.axes[0] ?? 0;
      feet[0]![3] = -(gp.axes[1] ?? 0);
      feet[1]![2] = gp.axes[2] ?? 0;
      feet[1]![3] = -(gp.axes[3] ?? 0);
    }
    feet.forEach(([x, y, rx, ry], i) => {
      const d = this.dots[i]!;
      d.dot.style.left = `${50 + x * 46}%`;
      d.dot.style.top = `${50 - y * 46}%`;
      d.raw.style.left = `${50 + rx * 46}%`;
      d.raw.style.top = `${50 - ry * 46}%`;
      d.val.textContent = `x ${x >= 0 ? '+' : ''}${x.toFixed(2)}  y ${y >= 0 ? '+' : ''}${y.toFixed(2)}`;
    });
    const s = this.stance.state;
    QUANTITIES.forEach((item, i) => {
      const v = Math.max(-1, Math.min(1, s[item.key]));
      const b = this.bars[i]!;
      b.fill.style.left = v >= 0 ? '50%' : `${50 + v * 50}%`;
      b.fill.style.width = `${Math.abs(v) * 50}%`;
      b.bar.className = `bar${v >= 0 ? ' pos' : ''}`;
      b.n.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
    });
    BUTTONS.forEach((b, i) => {
      this.btns[i]!.className = `btn${input[b.key] ? ' on' : ''}`;
    });
  }

  dispose(): void {
    this.root.remove();
  }
}
