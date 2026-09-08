/** Full-screen DOM menus (boot, main menu, pause, results). Keyboard + gamepad navigable. */
import type { RiderInput } from '@/rider/input';

const CSS = `
.scr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"Trebuchet MS","Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#f4fbff;text-shadow:0 2px 3px rgba(0,0,0,.6);pointer-events:auto;user-select:none}
.scr.dim{background:radial-gradient(ellipse at center,rgba(2,20,35,.35),rgba(2,12,22,.82))}
.scr .logo{font-size:96px;font-weight:900;letter-spacing:10px;line-height:1;color:#fff;text-shadow:0 4px 0 #0b4f6c,0 10px 24px rgba(0,0,0,.6)}
.scr .logo span{color:#3ef0a0}
.scr .tag{font-size:16px;letter-spacing:5px;color:#bfe9ff;margin-top:8px;font-weight:800}
.scr .press{margin-top:56px;font-size:20px;font-weight:800;letter-spacing:3px;animation:scrblink 1.1s steps(2,end) infinite}
@keyframes scrblink{50%{opacity:.25}}
.scr .panel{background:rgba(2,18,32,.62);border:2px solid rgba(255,255,255,.35);border-radius:16px;padding:26px 36px;min-width:520px;box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:94vh;overflow-y:auto;scrollbar-width:thin}
.scr h1{margin:0 0 14px 0;font-size:28px;letter-spacing:4px;font-weight:900;color:#fff}
.scr h2{margin:18px 0 8px 0;font-size:13px;letter-spacing:3px;color:#bfe9ff;font-weight:800}
.scr .item{font-size:22px;font-weight:800;padding:7px 14px;border-radius:8px;display:flex;justify-content:space-between;gap:30px}
.scr .item.sel{background:rgba(62,240,160,.22);color:#fff;outline:2px solid #3ef0a0}
.scr .item .val{color:#ffe27a;font-variant-numeric:tabular-nums}
.scr .item.disabled{opacity:.4}
.scr .foot{margin-top:18px;font-size:13px;color:#bfe9ff;letter-spacing:1px}
.scr .big{font-size:56px;font-weight:900;color:#ffe27a;font-variant-numeric:tabular-nums}
.scr table{border-collapse:collapse;font-size:17px;font-weight:700;margin-top:6px}
.scr td{padding:4px 18px 4px 0;color:#dff3ff}
.scr td.v{color:#fff;text-align:right;font-variant-numeric:tabular-nums}
.scr td.sub{padding-left:16px;font-weight:600;color:#c9e6f5}
.scr tr.head td{padding-top:12px;padding-bottom:2px;font-size:12px;letter-spacing:3px;color:#7ff2e6}
@keyframes rowin{from{opacity:0}to{opacity:1}}
.scr table.results tr{animation:rowin .32s ease-out both}
@media (prefers-reduced-motion: reduce){.scr table.results tr{animation:none}}
.scr .ok{color:#3ef0a0}.scr .bad{color:#ff7a7a}
`;

export function ensureScreenCss(): void {
  if (document.getElementById('scr-css')) return;
  const s = document.createElement('style');
  s.id = 'scr-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export interface MenuItem {
  id: string;
  label: string;
  /** Optional value shown right-aligned; left/right adjust it via onAdjust. */
  value?: () => string;
  onAdjust?: (dir: -1 | 1) => void;
  onSelect?: () => void;
  disabled?: boolean;
}

/** Edge-detected navigation from RiderInput (stick/d-pad + jump/A = select, grab/B = back). */
export class MenuNav {
  private prevY = 0;
  private prevX = 0;
  private prevSelect = false;
  private prevBack = false;
  private repeatT = 0;

  read(input: Readonly<RiderInput>, dt: number): { move: -1 | 0 | 1; adjust: -1 | 0 | 1; select: boolean; back: boolean } {
    const y = input.stickY > 0.5 ? 1 : input.stickY < -0.5 ? -1 : 0;
    const x = input.stickX > 0.5 ? 1 : input.stickX < -0.5 ? -1 : 0;
    let move: -1 | 0 | 1 = 0;
    let adjust: -1 | 0 | 1 = 0;
    if (y !== 0 && y !== this.prevY) {
      move = y === 1 ? -1 : 1;
      this.repeatT = 0.45;
    } else if (y !== 0) {
      this.repeatT -= dt;
      if (this.repeatT <= 0) {
        move = y === 1 ? -1 : 1;
        this.repeatT = 0.12;
      }
    }
    if (x !== 0 && x !== this.prevX) adjust = x;
    const selectNow = input.jump || input.cashIn || input.stand;
    const select = selectNow && !this.prevSelect;
    const backNow = input.grab || input.pause;
    const back = backNow && !this.prevBack;
    this.prevY = y;
    this.prevX = x;
    this.prevSelect = selectNow;
    this.prevBack = backNow;
    return { move, adjust, select, back };
  }

  /** Swallow the current button state so a press that opened a menu doesn't also select. */
  prime(input: Readonly<RiderInput>): void {
    this.prevSelect = input.jump || input.cashIn || input.stand;
    this.prevBack = input.grab || input.pause;
    this.prevY = input.stickY > 0.5 ? 1 : input.stickY < -0.5 ? -1 : 0;
    this.prevX = input.stickX > 0.5 ? 1 : input.stickX < -0.5 ? -1 : 0;
  }
}

export class MenuScreen {
  readonly root: HTMLDivElement;
  private list: HTMLDivElement;
  private rows: HTMLDivElement[] = [];
  selected = 0;
  private nav = new MenuNav();
  onBack: (() => void) | null = null;

  constructor(parent: HTMLElement, title: string, private items: MenuItem[], foot = '') {
    ensureScreenCss();
    this.root = document.createElement('div');
    this.root.className = 'scr dim';
    const panel = document.createElement('div');
    panel.className = 'panel';
    const h = document.createElement('h1');
    h.textContent = title;
    panel.appendChild(h);
    this.list = document.createElement('div');
    panel.appendChild(this.list);
    if (foot) {
      const f = document.createElement('div');
      f.className = 'foot';
      f.textContent = foot;
      panel.appendChild(f);
    }
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.rebuild();
  }

  private rebuild(): void {
    this.list.innerHTML = '';
    this.rows = [];
    this.items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'item' + (i === this.selected ? ' sel' : '') + (it.disabled ? ' disabled' : '');
      const l = document.createElement('span');
      l.textContent = it.label;
      row.appendChild(l);
      if (it.value) {
        const v = document.createElement('span');
        v.className = 'val';
        v.textContent = (it.onAdjust ? '◀ ' : '') + it.value() + (it.onAdjust ? ' ▶' : '');
        row.appendChild(v);
      }
      row.addEventListener('click', () => {
        this.selected = i;
        this.activate();
      });
      this.list.appendChild(row);
      this.rows.push(row);
    });
  }

  private activate(): void {
    const it = this.items[this.selected];
    if (!it || it.disabled) return;
    it.onSelect?.();
    this.rebuild();
  }

  prime(input: Readonly<RiderInput>): void {
    this.nav.prime(input);
  }

  update(input: Readonly<RiderInput>, dt: number): void {
    const n = this.nav.read(input, dt);
    if (n.move) {
      const count = this.items.length;
      for (let k = 0; k < count; k++) {
        this.selected = (this.selected + n.move + count) % count;
        if (!this.items[this.selected]?.disabled) break;
      }
      this.rebuild();
    }
    if (n.adjust) {
      const it = this.items[this.selected];
      if (it?.onAdjust) {
        it.onAdjust(n.adjust);
        this.rebuild();
      }
    }
    if (n.select) this.activate();
    if (n.back) this.onBack?.();
  }

  dispose(): void {
    this.root.remove();
  }
}

export class BootScreen {
  readonly root: HTMLDivElement;
  constructor(parent: HTMLElement, title: string, tag: string, press: string) {
    ensureScreenCss();
    this.root = document.createElement('div');
    this.root.className = 'scr dim';
    this.root.innerHTML = `<div class="logo">${title.replace('-', '<span>-</span>')}</div><div class="tag">${tag}</div><div class="press">${press}</div>`;
    parent.appendChild(this.root);
  }
  dispose(): void {
    this.root.remove();
  }
}

export interface ResultRow {
  label: string;
  value: string;
  ok?: boolean;
  /** A section heading (the label only, small caps). */
  head?: boolean;
  /** An indented line under a heading. */
  sub?: boolean;
}

export class ResultsScreen {
  readonly root: HTMLDivElement;
  private nav = new MenuNav();
  onDone: (() => void) | null = null;
  /** Secondary action (slide / Y): e.g. watch the replay. */
  onAlt: (() => void) | null = null;
  private timer = 0;
  private prevAlt = false;
  private bigEl: HTMLDivElement;
  private bigTarget: number | null = null;
  private bigShown = -1;

  constructor(parent: HTMLElement, title: string, big: string, rows: ResultRow[], foot: string) {
    ensureScreenCss();
    this.root = document.createElement('div');
    this.root.className = 'scr dim';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<h1>${title}</h1><div class="big"></div>`;
    this.bigEl = panel.querySelector('.big')!;
    // a plain number counts up like a broadcast scoreboard; anything else just shows
    const numeric = Number(big.replace(/,/g, ''));
    if (big && Number.isFinite(numeric) && /^[\d,]+$/.test(big)) this.bigTarget = numeric;
    else this.bigEl.textContent = big;
    const table = document.createElement('table');
    table.className = 'results';
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.style.animationDelay = `${0.25 + i * 0.07}s`;
      if (r.head) {
        tr.className = 'head';
        const a = document.createElement('td');
        a.colSpan = 2;
        a.textContent = r.label;
        tr.append(a);
      } else {
        const a = document.createElement('td');
        a.textContent = r.label;
        if (r.sub) a.className = 'sub';
        const b = document.createElement('td');
        b.className = 'v' + (r.ok === true ? ' ok' : r.ok === false ? ' bad' : '');
        b.textContent = r.value;
        tr.append(a, b);
      }
      table.appendChild(tr);
    });
    panel.appendChild(table);
    const f = document.createElement('div');
    f.className = 'foot';
    f.textContent = foot;
    panel.appendChild(f);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  prime(input: Readonly<RiderInput>): void {
    this.nav.prime(input);
    this.prevAlt = input.slide;
    this.timer = 0;
  }

  update(input: Readonly<RiderInput>, dt: number): void {
    this.timer += dt;
    if (this.bigTarget !== null) {
      // count up over a second and a bit, easing out so the last digits settle
      const k = Math.min(1, this.timer / 1.3);
      const shown = Math.round(this.bigTarget * (1 - Math.pow(1 - k, 3)));
      if (shown !== this.bigShown) {
        this.bigShown = shown;
        this.bigEl.textContent = shown.toLocaleString('en-US');
      }
    }
    const n = this.nav.read(input, dt);
    const alt = input.slide && !this.prevAlt;
    this.prevAlt = input.slide;
    if (this.timer > 0.6 && alt && this.onAlt) this.onAlt();
    else if (this.timer > 0.6 && (n.select || n.back)) this.onDone?.();
  }

  dispose(): void {
    this.root.remove();
  }
}
