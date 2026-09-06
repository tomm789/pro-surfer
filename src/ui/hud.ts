/**
 * In-ride HUD (design doc §7). DOM overlay, updated from a plain state object each frame.
 * Layout: score/clock/special meter top-right · objective top-left · trick tracker bottom-centre ·
 * wave meter lower-right · landing rating + balance meter near the middle · hints bottom-left.
 */
export interface HudState {
  score: number;
  clock: number | null;
  meter: number;
  meterState: 'empty' | 'green' | 'yellow';
  specialTime: number;
  chainLabel: string;
  chainBase: number;
  chainMultiplier: number;
  chainOpen: boolean;
  objective: string[];
  waveHeightFt: number;
  nextWaveFt: number | null;
  /** Section markers as metres ahead of the rider (negative = behind). */
  sectionsAhead: number[];
  warning: boolean;
  balance: number | null;
  tubeDepth: number;
  tubeState: 'face' | 'tube' | 'air' | 'prone' | 'wipeout' | 'floater';
  hint: string;
  debug: string;
  flash: string;
  hazard: boolean;
}

const CSS = `
.hud{position:absolute;inset:0;pointer-events:none;font-family:"Trebuchet MS","Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#f4fbff;text-shadow:0 2px 3px rgba(0,0,0,.55),0 0 12px rgba(0,40,60,.5);user-select:none}
.hud *{box-sizing:border-box}
.hud .tr{position:absolute;top:18px;right:24px;text-align:right}
.hud .score{font-size:44px;font-weight:900;letter-spacing:1px;line-height:1;font-variant-numeric:tabular-nums}
.hud .clock{font-size:26px;font-weight:800;margin-top:4px;font-variant-numeric:tabular-nums;color:#dff3ff}
.hud .clock.low{color:#ffb84d}
.hud .clock.over{color:#ff7a3d}
.hud .meterwrap{margin-top:10px;width:220px;height:16px;border:2px solid rgba(255,255,255,.85);border-radius:9px;background:rgba(0,20,35,.55);overflow:hidden;margin-left:auto;position:relative}
.hud .meterfill{height:100%;width:0;background:linear-gradient(90deg,#26c281,#3ef0a0);transition:width 60ms linear}
.hud .meterwrap.yellow .meterfill{background:linear-gradient(90deg,#ffd23f,#fff2a8);animation:hudflash .28s steps(2,end) infinite}
@keyframes hudflash{0%{filter:brightness(1)}50%{filter:brightness(1.6)}100%{filter:brightness(1)}}
.hud .meterlabel{font-size:12px;font-weight:800;letter-spacing:2px;margin-top:4px;color:#bfe9ff}
.hud .meterlabel.yellow{color:#ffe27a}
.hud .special{font-size:14px;font-weight:700;color:#ffe27a;height:18px}
.hud .tl{position:absolute;top:18px;left:24px;font-size:15px;font-weight:700;line-height:1.5;white-space:pre}
.hud .tl .title{font-size:13px;letter-spacing:2px;color:#bfe9ff;font-weight:800}
.hud .bc{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);text-align:center;min-width:320px}
.hud .chain{font-size:22px;font-weight:800;color:#ffffff;white-space:nowrap}
.hud .chain .sp{color:#ffe27a}
.hud .chainmath{font-size:16px;font-weight:700;color:#bfe9ff;margin-top:2px;font-variant-numeric:tabular-nums}
.hud .bank{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);font-size:34px;font-weight:900;color:#ffe27a;opacity:0;transition:opacity .15s}
.hud .bank.show{opacity:1;animation:hudpop .6s ease-out}
@keyframes hudpop{0%{transform:translateX(-50%) scale(.6)}60%{transform:translateX(-50%) scale(1.15)}100%{transform:translateX(-50%) scale(1)}}
.hud .lr{position:absolute;right:24px;bottom:34px;width:230px}
.hud .wm{height:54px;border:2px solid rgba(255,255,255,.8);border-radius:8px;background:rgba(0,20,35,.5);position:relative;overflow:hidden}
.hud .wm .line{position:absolute;left:8px;right:8px;top:30px;height:3px;background:rgba(255,255,255,.6);border-radius:2px}
.hud .wm .rider{position:absolute;top:22px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid #ff7a3d;transform:translateX(-6px)}
.hud .wm .sec{position:absolute;top:24px;width:10px;height:14px;border-radius:3px;background:#f4fbff;transform:translateX(-5px);opacity:.9}
.hud .wm .sec.warn{background:#ffb84d;animation:hudflash .3s steps(2,end) infinite}
.hud .wm .h{position:absolute;left:8px;top:4px;font-size:13px;font-weight:800;letter-spacing:1px}
.hud .wm .next{position:absolute;right:8px;top:4px;font-size:12px;font-weight:700;color:#bfe9ff}
.hud .warn{margin-top:6px;text-align:center;font-size:14px;font-weight:900;letter-spacing:2px;color:#ffb84d;height:18px}
.hud .hazard{margin-top:2px;text-align:center;font-size:20px;font-weight:900;color:#ffe27a;height:24px}
.hud .rating{position:absolute;left:50%;top:38%;transform:translateX(-50%);font-size:40px;font-weight:900;letter-spacing:2px;opacity:0}
.hud .rating.show{opacity:1;animation:hudpop .5s ease-out}
.hud .rating.perfect{color:#3ef0a0}.hud .rating.sloppy{color:#ffb84d}.hud .rating.wipeout{color:#ff5a5a}.hud .rating.info{color:#ffe27a;font-size:26px}
.hud .bal{position:absolute;left:62%;top:30%;width:22px;height:220px;border:2px solid rgba(255,255,255,.85);border-radius:11px;background:linear-gradient(180deg,#ffd23f,#ff6a3d);opacity:0}
.hud .bal.show{opacity:1}
.hud .bal .mark{position:absolute;left:-10px;width:0;height:0;border-left:19px solid transparent;border-right:19px solid transparent;border-top:22px solid #ff3b3b;transform:translateY(-11px)}
.hud .bal .mid{position:absolute;left:0;right:0;top:50%;height:2px;background:rgba(255,255,255,.9)}
.hud .bal .depth{position:absolute;left:28px;top:0;font-size:12px;font-weight:800;color:#ffe27a;white-space:nowrap}
.hud .bl{position:absolute;left:24px;bottom:22px;font-size:12px;font-weight:600;color:#bfe9ff;opacity:.85;white-space:pre}
.hud .dbg{position:absolute;left:24px;bottom:60px;font:11px/1.4 ui-monospace,Menlo,monospace;color:#cfe;white-space:pre;opacity:.9}
`;

function el(parent: HTMLElement, cls: string, text = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text) d.textContent = text;
  parent.appendChild(d);
  return d;
}

export class Hud {
  readonly root: HTMLDivElement;
  private score: HTMLDivElement;
  private clock: HTMLDivElement;
  private meterWrap: HTMLDivElement;
  private meterFill: HTMLDivElement;
  private meterLabel: HTMLDivElement;
  private special: HTMLDivElement;
  private objective: HTMLDivElement;
  private chain: HTMLDivElement;
  private chainMath: HTMLDivElement;
  private bank: HTMLDivElement;
  private wm: HTMLDivElement;
  private wmH: HTMLDivElement;
  private wmNext: HTMLDivElement;
  private wmRider: HTMLDivElement;
  private wmSecs: HTMLDivElement[] = [];
  private warn: HTMLDivElement;
  private hazard: HTMLDivElement;
  private rating: HTMLDivElement;
  private bal: HTMLDivElement;
  private balMark: HTMLDivElement;
  private balDepth: HTMLDivElement;
  private hint: HTMLDivElement;
  private dbg: HTMLDivElement;
  private bankTimer = 0;
  private ratingTimer = 0;
  private lastScore = -1;
  private shownScore = 0;

  constructor(parent: HTMLElement) {
    if (!document.getElementById('hud-css')) {
      const style = document.createElement('style');
      style.id = 'hud-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = el(parent, 'hud');
    const tr = el(this.root, 'tr');
    this.score = el(tr, 'score', '0');
    this.clock = el(tr, 'clock', '3:00');
    this.meterWrap = el(tr, 'meterwrap');
    this.meterFill = el(this.meterWrap, 'meterfill');
    this.meterLabel = el(tr, 'meterlabel', 'SPECIAL');
    this.special = el(tr, 'special', '');
    this.objective = el(this.root, 'tl');
    const bc = el(this.root, 'bc');
    this.chain = el(bc, 'chain', '');
    this.chainMath = el(bc, 'chainmath', '');
    this.bank = el(this.root, 'bank', '');
    const lr = el(this.root, 'lr');
    this.wm = el(lr, 'wm');
    el(this.wm, 'line');
    this.wmH = el(this.wm, 'h', '8 FT');
    this.wmNext = el(this.wm, 'next', '');
    this.wmRider = el(this.wm, 'rider');
    for (let i = 0; i < 4; i++) {
      const s = el(this.wm, 'sec');
      s.style.display = 'none';
      this.wmSecs.push(s);
    }
    this.warn = el(lr, 'warn', '');
    this.hazard = el(lr, 'hazard', '');
    this.rating = el(this.root, 'rating', '');
    this.bal = el(this.root, 'bal');
    el(this.bal, 'mid');
    this.balMark = el(this.bal, 'mark');
    this.balDepth = el(this.bal, 'depth', '');
    this.hint = el(this.root, 'bl', '');
    this.dbg = el(this.root, 'dbg', '');
  }

  /** Show a landing rating or short message in the middle of the screen. */
  flash(text: string, kind: 'perfect' | 'sloppy' | 'wipeout' | 'info', seconds = 1.1): void {
    this.rating.textContent = text;
    this.rating.className = `rating show ${kind}`;
    this.ratingTimer = seconds;
  }

  showBank(total: number, cashedIn: boolean): void {
    this.bank.textContent = `${cashedIn ? 'CASHED ' : ''}+${total.toLocaleString('en-US')}`;
    this.bank.classList.remove('show');
    void this.bank.offsetWidth; // restart animation
    this.bank.classList.add('show');
    this.bankTimer = 1.4;
  }

  update(s: HudState, dt: number): void {
    // score counts up toward the real value
    if (this.lastScore !== s.score) {
      this.lastScore = s.score;
    }
    if (this.shownScore !== s.score) {
      const diff = s.score - this.shownScore;
      this.shownScore = Math.abs(diff) < 50 ? s.score : this.shownScore + Math.sign(diff) * Math.max(50, Math.abs(diff) * Math.min(1, dt * 8));
      this.score.textContent = Math.round(this.shownScore).toLocaleString('en-US');
    }
    if (s.clock === null) {
      this.clock.textContent = 'FREE SURF';
      this.clock.className = 'clock';
    } else {
      const c = Math.max(0, s.clock);
      const m = Math.floor(c / 60);
      const sec = Math.floor(c % 60);
      this.clock.textContent = `${m}:${sec.toString().padStart(2, '0')}`;
      this.clock.className = 'clock' + (c <= 0 ? ' over' : c < 20 ? ' low' : '');
    }
    this.meterFill.style.width = `${Math.round(s.meter * 100)}%`;
    const yellow = s.meterState === 'yellow';
    this.meterWrap.className = 'meterwrap' + (yellow ? ' yellow' : '');
    this.meterLabel.className = 'meterlabel' + (yellow ? ' yellow' : '');
    this.meterLabel.textContent = yellow ? 'SPECIAL · LINK ANYTHING' : 'SPECIAL';
    this.special.textContent = s.specialTime > 0 ? `special time ${s.specialTime.toFixed(1)}s` : '';
    this.objective.innerHTML = '';
    if (s.objective.length) {
      el(this.objective, 'title', s.objective[0]!);
      for (const line of s.objective.slice(1)) el(this.objective, '', line);
    }
    if (s.chainOpen) {
      this.chain.innerHTML = s.chainLabel
        .split(' + ')
        .map((n) => (/[A-Z]/.test(n) && n.length > 3 ? `<span>${escapeHtml(n)}</span>` : escapeHtml(n)))
        .join(' <span class="sp">+</span> ');
      this.chainMath.textContent = `${Math.round(s.chainBase).toLocaleString('en-US')} × ${s.chainMultiplier}`;
    } else {
      this.chain.textContent = '';
      this.chainMath.textContent = '';
    }
    if (this.bankTimer > 0) {
      this.bankTimer -= dt;
      if (this.bankTimer <= 0) this.bank.classList.remove('show');
    }
    if (this.ratingTimer > 0) {
      this.ratingTimer -= dt;
      if (this.ratingTimer <= 0) this.rating.className = 'rating';
    }
    // wave meter: rider at 25% from the left, +60 m to the right edge
    this.wmH.textContent = `${s.waveHeightFt.toFixed(0)} FT`;
    this.wmNext.textContent = s.nextWaveFt !== null ? `next ${s.nextWaveFt.toFixed(0)} ft` : '';
    const w = 214;
    const toX = (m: number) => 8 + (w - 16) * (0.25 + m / 80);
    this.wmRider.style.left = `${toX(0)}px`;
    for (let i = 0; i < this.wmSecs.length; i++) {
      const m = s.sectionsAhead[i];
      const d = this.wmSecs[i]!;
      if (m === undefined || m < -20 || m > 60) d.style.display = 'none';
      else {
        d.style.display = 'block';
        d.style.left = `${toX(m)}px`;
        d.className = 'sec' + (s.warning && m > 0 ? ' warn' : '');
      }
    }
    this.warn.textContent = s.warning ? 'WATCH THAT BREAK' : '';
    this.hazard.textContent = s.hazard ? '!' : '';
    if (s.balance !== null) {
      this.bal.className = 'bal show';
      this.balMark.style.top = `${(0.5 + s.balance * 0.48) * 100}%`;
      const zone = s.tubeDepth > 0.66 ? 'PIT' : s.tubeDepth > 0.33 ? 'DEEP' : 'SHALLOW';
      this.balDepth.textContent = `${zone} ${(s.tubeDepth * 100).toFixed(0)}%`;
      this.bal.style.background = `linear-gradient(180deg,#ffd23f ${100 - s.tubeDepth * 100}%,#ff3b3b)`;
    } else this.bal.className = 'bal';
    this.hint.textContent = s.hint;
    this.dbg.textContent = s.debug;
  }

  dispose(): void {
    this.root.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
