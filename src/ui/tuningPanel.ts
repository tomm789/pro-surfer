/**
 * Live tuning panel for the controller session: the constants that decide how the sticks feel, edited
 * while riding. The values are changed in place in TUNING, which the simulation reads every step, so
 * a nudge shows on the very next frame. Nothing is saved: the changed values are copied out as JSON
 * to paste into data/tuning.json once they feel right.
 *
 * Keys (chosen not to collide with either foot or any button): T opens and closes, PageUp/PageDown
 * pick a row, comma/period nudge by 5%, 0 resets the row, 9 copies every changed value.
 */
import { TUNING } from '@/core/tuning';

/** The rows, as paths into TUNING, in the order the backlog's session works through them. */
const ROWS: { path: string; note: string }[] = [
  { path: 'stance.footFollowRate', note: 'how fast a foot answers the stick' },
  { path: 'stance.railFollowRate', note: 'how fast the rail follows the feet' },
  { path: 'stance.railCarveBonus', note: 'extra turn rate from a buried rail' },
  { path: 'stance.compressionTurnBonus', note: 'extra turn rate from a crouch' },
  { path: 'rider.turnRate', note: 'base turn rate' },
  { path: 'rider.headingMaxRad', note: 'where a held rail stops turning' },
  { path: 'rider.headingLevelRate', note: 'auto-trim: how fast quiet sticks level the board' },
  { path: 'stance.pumpFullRate', note: 'compression rate that counts as a full pump' },
  { path: 'stance.pumpAccelScale', note: 'speed from a pump' },
  { path: 'stance.pumpPhaseDeadzone', note: 'how much slope counts as flat for the pump phase' },
  { path: 'stance.trimDriveScale', note: 'speed from pressing the nose' },
  { path: 'stance.popRate', note: 'extension rate that fires the pop' },
  { path: 'stance.loadDecaySeconds', note: 'how long a crouch stays loaded' },
  { path: 'stance.twistTorque', note: 'board yaw from twisting the feet' },
  { path: 'stance.twistGrip', note: 'yaw the rail holds before it slides' },
  { path: 'stance.twistMaxRad', note: 'furthest the board yaws' },
  { path: 'stance.twistRecover', note: 'how fast the board comes back straight' },
  { path: 'stance.twistSteer', note: 'how much a recovering pivot turns the line' },
  { path: 'stance.slideScrub', note: 'speed lost while sliding' },
  { path: 'stance.slideFailSeconds', note: 'slide length before a wipeout' },
  { path: 'stance.stallTrim', note: 'tail pressure that stalls' },
  { path: 'stance.tuckSpinBonus', note: 'faster spin from a tuck in the air' },
  { path: 'stance.airTwistScale', note: 'spin from twisting in the air' },
  { path: 'stance.airRollRate', note: 'flip rate from the rail in the air' },
  { path: 'air.rollPerfectDeg', note: 'roll landing window for Perfect' },
  { path: 'air.rollSloppyDeg', note: 'roll landing window before a wipeout' },
  { path: 'stance.landAbsorb', note: 'landing forgiveness from a crouch' },
  { path: 'stance.grabSettleSeconds', note: 'how long a foot shape must hold to be a grab' },
  { path: 'recognizer.engageRail', note: 'rail that starts a turn' },
  { path: 'recognizer.releaseRail', note: 'rail that ends a turn' },
  { path: 'recognizer.minSwingRad', note: 'smallest direction change that counts' },
  { path: 'recognizer.lipV', note: 'height that makes an off-the-lip' },
  { path: 'recognizer.highV', note: 'height that makes a snap' },
  { path: 'recognizer.bottomV', note: 'depth that makes a bottom turn' },
  { path: 'recognizer.slideSeconds', note: 'slide that makes a tail slide' },
  { path: 'camera.skateDistance', note: 'chase camera distance' },
  { path: 'camera.skateHeight', note: 'chase camera height' },
  { path: 'camera.skateFov', note: 'chase camera field of view' },
  { path: 'camera.railSwing', note: 'camera swing on a rail' },
  { path: 'camera.compressionDrop', note: 'camera drop on a crouch' },
  { path: 'camera.speedDolly', note: 'camera pull-back with speed' },
  { path: 'camera.fpEyeHeight', note: 'first person eye height' },
  { path: 'camera.fpLookDownDeg', note: 'first person look-down angle' },
  { path: 'camera.fpFov', note: 'first person field of view' },
];

type Bag = Record<string, unknown>;

function get(path: string): number {
  let o: unknown = TUNING;
  for (const k of path.split('.')) o = (o as Bag)[k];
  return o as number;
}

function set(path: string, v: number): void {
  const keys = path.split('.');
  let o: unknown = TUNING;
  for (const k of keys.slice(0, -1)) o = (o as Bag)[k];
  (o as Bag)[keys[keys.length - 1]!] = v;
}

const CSS = `
.tune{position:absolute;left:14px;top:60px;width:440px;max-height:calc(100vh - 120px);overflow:hidden;background:rgba(2,18,32,.8);border:1px solid rgba(255,255,255,.3);border-radius:10px;padding:10px 12px;font:12px/1.45 ui-monospace,Menlo,monospace;color:#dff3ff;pointer-events:none;z-index:30}
.tune h2{margin:0 0 6px;font:700 12px/1.2 "Trebuchet MS",sans-serif;letter-spacing:3px;color:#7ff2e6}
.tune .row{display:grid;grid-template-columns:1fr 64px 64px;gap:8px;padding:1px 4px;border-radius:4px;white-space:nowrap}
.tune .row.sel{background:rgba(127,242,230,.18);color:#fff}
.tune .row .v{text-align:right}
.tune .row.changed .v{color:#ffb56b;font-weight:700}
.tune .row .o{text-align:right;opacity:.5}
.tune .note{opacity:.75;font-size:11px;margin:4px 0 0}
.tune .keys{margin-top:6px;font-size:11px;color:#9fd8e8}
.tune .msg{margin-top:4px;color:#3ef0a0}
`;
let cssDone = false;
/** The values as loaded from data/tuning.json, captured once: closing and reopening the panel must not forget them. */
const ORIGINAL = new Map<string, number>();

export class TuningPanel {
  readonly root: HTMLDivElement;
  private sel = 0;
  private original = ORIGINAL;
  private rowsEl: HTMLDivElement[] = [];
  private noteEl: HTMLDivElement;
  private msgEl: HTMLDivElement;
  private msgTimer = 0;
  private list: HTMLDivElement;

  constructor(parent: HTMLElement) {
    if (!cssDone) {
      const s = document.createElement('style');
      s.textContent = CSS;
      document.head.appendChild(s);
      cssDone = true;
    }
    for (const r of ROWS) if (!this.original.has(r.path)) this.original.set(r.path, get(r.path));
    this.root = document.createElement('div');
    this.root.className = 'tune';
    this.root.innerHTML = '<h2>LIVE TUNING</h2>';
    this.list = document.createElement('div');
    for (const r of ROWS) {
      const d = document.createElement('div');
      d.className = 'row';
      d.innerHTML = `<span>${r.path}</span><span class="v"></span><span class="o"></span>`;
      this.list.appendChild(d);
      this.rowsEl.push(d);
    }
    this.root.appendChild(this.list);
    this.noteEl = document.createElement('div');
    this.noteEl.className = 'note';
    this.root.appendChild(this.noteEl);
    const keys = document.createElement('div');
    keys.className = 'keys';
    keys.textContent = 'PgUp/PgDn pick · , . nudge 5% · 0 reset · 9 copy changed as JSON · T close';
    this.root.appendChild(keys);
    this.msgEl = document.createElement('div');
    this.msgEl.className = 'msg';
    this.root.appendChild(this.msgEl);
    parent.appendChild(this.root);
    this.render();
  }

  move(d: number): void {
    this.sel = (this.sel + d + ROWS.length) % ROWS.length;
    this.render();
  }

  nudge(dir: number): void {
    const r = ROWS[this.sel]!;
    const v = get(r.path);
    const base = this.original.get(r.path) ?? v;
    // 5% of the current value, or a small absolute step when the value sits at zero
    const step = v !== 0 ? Math.abs(v) * 0.05 : Math.max(0.01, Math.abs(base) * 0.05);
    set(r.path, +(v + dir * step).toPrecision(4));
    this.render();
  }

  reset(): void {
    const r = ROWS[this.sel]!;
    set(r.path, this.original.get(r.path)!);
    this.render();
  }

  /** The changed values as nested JSON in tuning.json's shape. */
  changedJson(): string {
    const out: Record<string, Record<string, number>> = {};
    for (const r of ROWS) {
      const v = get(r.path);
      if (v === this.original.get(r.path)) continue;
      const [a, b] = r.path.split('.') as [string, string];
      (out[a] ??= {})[b] = v;
    }
    return JSON.stringify(out, null, 2);
  }

  copy(): void {
    const json = this.changedJson();
    const n = Object.values(JSON.parse(json) as Record<string, object>).reduce((s, o) => s + Object.keys(o).length, 0);
    void navigator.clipboard?.writeText(json).catch(() => undefined);
    console.log('[tuning] changed values:\n' + json);
    this.say(n ? `copied ${n} changed value${n > 1 ? 's' : ''} (also in the console)` : 'nothing changed yet');
  }

  private say(text: string): void {
    this.msgEl.textContent = text;
    this.msgTimer = 3;
  }

  update(dt: number): void {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msgEl.textContent = '';
    }
  }

  private render(): void {
    ROWS.forEach((r, i) => {
      const d = this.rowsEl[i]!;
      const v = get(r.path);
      const o = this.original.get(r.path)!;
      d.className = `row${i === this.sel ? ' sel' : ''}${v !== o ? ' changed' : ''}`;
      (d.children[1] as HTMLElement).textContent = fmt(v);
      (d.children[2] as HTMLElement).textContent = v !== o ? fmt(o) : '';
    });
    this.noteEl.textContent = ROWS[this.sel]!.note;
    // keep the selected row in view: the list shows a window of rows around it
    const rowH = this.rowsEl[0]!.offsetHeight || 18;
    const visible = Math.max(6, Math.floor((window.innerHeight - 220) / rowH));
    const first = Math.max(0, Math.min(ROWS.length - visible, this.sel - Math.floor(visible / 2)));
    this.rowsEl.forEach((d, i) => (d.style.display = i >= first && i < first + visible ? '' : 'none'));
  }

  dispose(): void {
    this.root.remove();
  }
}

function fmt(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0');
}
