/**
 * Trick book screen. In the stick scheme a face turn is a shape the board makes, not a button, so the
 * book describes the shapes the recogniser is looking for (with its actual thresholds, read from the
 * tuning so the page never lies) and the foot shapes that pick each air grab. In the classic scheme it
 * is the button list it always was.
 */
import type { Trick, TrickInput } from '@/tricks/catalogue';
import { TRICKS, describeFeet } from '@/tricks/catalogue';
import { TUNING } from '@/core/tuning';
import { ensureScreenCss, MenuNav } from './screens';
import type { RiderInput } from '@/rider/input';

const BTN: Record<string, string> = { carve: 'Carve (J / X)', grab: 'Grab (K / B)', slide: 'Slide (L / Y)' };
const DIRS: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→', upLeft: '↖', upRight: '↗', downLeft: '↙', downRight: '↘' };

export type BookScheme = 'dual' | 'classic';

export function describeInput(inp: TrickInput): string {
  switch (inp.kind) {
    case 'dir':
      return `${DIRS[inp.direction]} + ${BTN[inp.button]}`;
    case 'double':
      return `${BTN[inp.button]} ×2${inp.context === 'lip' ? ' at the lip' : inp.context === 'face' ? ' on the face' : ''}`;
    case 'combo':
      return `${BTN[inp.button]} then ${BTN[inp.then]}`;
    case 'seq':
      return `${inp.sequence.map((d) => DIRS[d]).join(' ')} + ${BTN[inp.button]}`;
    case 'hold':
      return `hold ${BTN[inp.button]}${inp.with ? ` + ${BTN[inp.with]}` : ''} + ←/→`;
    case 'exit':
      return `in the air: Slide, Slide, ${inp.sequence.map((d) => DIRS[d]).join(' ')}`;
  }
}

/** How to do a trick in the given scheme. In the stick scheme an air grab is a hand plus a foot shape. */
export function describeTrick(t: Trick, scheme: BookScheme): string {
  if (scheme === 'dual' && t.feet && t.input.kind === 'dir') return `hold ${BTN[t.input.button]} · ${describeFeet(t.feet)}`;
  return describeInput(t.input);
}

interface Row {
  name: string;
  how: string;
  value: string;
  locked?: boolean;
}

interface Page {
  title: string;
  note?: string;
  rows: Row[];
}

const deg = (rad: number) => `${Math.round((rad * 180) / Math.PI)}°`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The face page for the stick scheme: what the board has to do for each name, from the recogniser's own numbers. */
function faceShapes(): Page {
  const R = TUNING.recognizer;
  const S = TUNING.stance;
  const w = (k: keyof typeof R.worth) => `×${(R.worth[k] ?? 1).toFixed(2)}`;
  return {
    title: 'FACE TURNS · SHAPES',
    note:
      `A turn starts when the rail passes ${pct(R.engageRail)} and ends once it has stayed below ${pct(R.releaseRail)} for ${R.releaseSeconds.toFixed(2)} s (reverse the rail inside that and the turn carries on); it must swing the board at least ${deg(R.minSwingRad)}. ` +
      `Quality is 45% rail commitment, 35% direction change (full at ${deg(R.fullSwingRad)}) and 20% height on the face; above ${pct(R.perfectQuality)} is Perfect. ` +
      `Base = face basic ${TUNING.scoring.base.faceBasic[0]}–${TUNING.scoring.base.faceBasic[1]} × the worth below.`,
    rows: [
      { name: 'Bottom Turn', how: `from the trough (below ${pct(R.bottomV)} up the face), rail toward the wall, turning up`, value: w('bottomTurn') },
      { name: 'Carve', how: 'any other clean rail turn on the face', value: w('carve') },
      { name: 'Snap', how: `rail high on the face (above ${pct(R.highV)}) — or the tail let go right at the lip`, value: w('snap') },
      { name: 'Off the Lip', how: `rail at the lip (above ${pct(R.lipV)}), tail holding`, value: w('offTheLip') },
      { name: 'Cutback', how: `rail away from the wall, held longer than ${R.cutbackSeconds.toFixed(1)} s`, value: w('cutback') },
      { name: 'Roundhouse', how: 'a cutback that reverses the rail before it releases', value: w('roundhouse') },
      { name: 'Tail Slide', how: `twist past the grip (${pct(S.twistGrip)}) for ${R.slideSeconds.toFixed(2)} s, or the board yawed past ${deg(R.slideYawRad)}`, value: w('tailSlide') },
      { name: 'Layback', how: `a slide on a rail past ${pct(R.laybackRail)}`, value: w('layback') },
    ],
  };
}

/** The body page: the five quantities the sticks make, in one screen (docs/MECHANICS.md §2). */
function bodyPage(): Page {
  return {
    title: 'THE STICKS · THE BODY',
    note: 'Left stick is the back foot, right stick is the front foot. Down presses that foot, up pulls it. Nothing here is a combo: the board answers the feet every frame.',
    rows: [
      { name: 'Crouch / extend', how: 'both sticks down / both up', value: 'compression' },
      { name: 'Drive / stall', how: 'press the nose (front down, back up) / press the tail', value: 'trim' },
      { name: 'Carve', how: 'both sticks lean the same way; toward the wall climbs, away drops', value: 'rail' },
      { name: 'Pivot / slide', how: 'sticks lean opposite ways; past the grip the tail lets go', value: 'twist' },
      { name: 'Pump', how: 'extend while climbing, crouch while dropping — in time with the face', value: 'pump' },
      { name: 'Pop', how: 'crouch, then flick both sticks up at the lip', value: 'launch' },
      { name: 'Floater', how: 'unweight (both up) over the foam, crouch to hold it', value: 'floater' },
      { name: 'Barrel', how: 'press the tail to stall into it, crouch to fit, small leans for balance', value: 'tube' },
    ],
  };
}

export class TrickBookScreen {
  readonly root: HTMLDivElement;
  private nav = new MenuNav();
  onBack: (() => void) | null = null;
  private page = 0;
  private pages: Page[];
  private body: HTMLDivElement;
  private title: HTMLHeadingElement;

  constructor(
    parent: HTMLElement,
    private unlocked: Set<string> | null,
    private scheme: BookScheme = 'dual',
  ) {
    ensureScreenCss();
    const rows = (tricks: Trick[]): Row[] =>
      tricks.map((t) => {
        const locked = !!(this.unlocked && t.special && !this.unlocked.has(t.id));
        return { name: locked ? '??? (locked)' : t.name, how: locked ? '—' : describeTrick(t, this.scheme), value: locked ? '' : t.base ? t.base.toLocaleString('en-US') : '', locked };
      });
    const specialsNote = 'Specials are still sequences on the classic stick (the left one) and need the flashing special meter.';
    this.pages =
      scheme === 'dual'
        ? [
            bodyPage(),
            faceShapes(),
            { title: 'FACE SPECIALS', note: specialsNote, rows: rows(TRICKS.bySection('face').filter((t) => t.special)) },
            {
              title: 'AIR GRABS & FLIPS · SHAPES',
              note: `Hold a hand on the rail — Grab is the back hand, Carve the front — and where the feet are picks the grab. Toe-side is toward the wall. The shape must hold ${Math.round(TUNING.stance.grabSettleSeconds * 1000)} ms; one grab per press, so two grabs in one air is two presses.`,
              rows: rows(TRICKS.bySection('air').filter((t) => !t.special)),
            },
            { title: 'AIR SPECIALS', note: specialsNote, rows: rows(TRICKS.bySection('air').filter((t) => t.special)) },
            { title: 'TUBE TRICKS', note: 'Direction on the left stick plus the button, as in the classic scheme.', rows: rows(TRICKS.bySection('tube')) },
            { title: 'EXIT MOVES', rows: rows(TRICKS.bySection('exit')) },
          ]
        : [
            { title: 'FACE TRICKS', rows: rows(TRICKS.bySection('face').filter((t) => !t.special)) },
            { title: 'FACE SPECIALS', rows: rows(TRICKS.bySection('face').filter((t) => t.special)) },
            { title: 'AIR GRABS & FLIPS', rows: rows(TRICKS.bySection('air').filter((t) => !t.special)) },
            { title: 'AIR SPECIALS', rows: rows(TRICKS.bySection('air').filter((t) => t.special)) },
            { title: 'TUBE TRICKS', rows: rows(TRICKS.bySection('tube')) },
            { title: 'EXIT MOVES', rows: rows(TRICKS.bySection('exit')) },
          ];
    this.root = document.createElement('div');
    this.root.className = 'scr dim';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.minWidth = '720px';
    panel.style.maxWidth = '960px';
    this.title = document.createElement('h1');
    panel.appendChild(this.title);
    this.body = document.createElement('div');
    panel.appendChild(this.body);
    const foot = document.createElement('div');
    foot.className = 'foot';
    foot.textContent = '←/→: page · B / Esc: back · specials need the flashing special meter';
    panel.appendChild(foot);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.render();
  }

  private render(): void {
    const p = this.pages[this.page]!;
    this.title.textContent = `TRICK BOOK · ${p.title}  (${this.page + 1}/${this.pages.length})`;
    this.body.innerHTML = '';
    if (p.note) {
      const note = document.createElement('p');
      note.style.cssText = 'opacity:.8;font-size:13px;line-height:1.45;max-width:900px;margin:0 0 10px';
      note.textContent = p.note;
      this.body.appendChild(note);
    }
    const table = document.createElement('table');
    for (const r of p.rows) {
      const tr = document.createElement('tr');
      const a = document.createElement('td');
      a.textContent = r.name;
      const b = document.createElement('td');
      b.className = 'v';
      b.textContent = r.how;
      const c = document.createElement('td');
      c.className = 'v';
      c.textContent = r.value;
      tr.append(a, b, c);
      if (r.locked) tr.style.opacity = '0.45';
      table.appendChild(tr);
    }
    this.body.appendChild(table);
  }

  prime(input: Readonly<RiderInput>): void {
    this.nav.prime(input);
  }

  update(input: Readonly<RiderInput>, dt: number): void {
    const n = this.nav.read(input, dt);
    if (n.adjust) {
      this.page = (this.page + n.adjust + this.pages.length) % this.pages.length;
      this.render();
    }
    if (n.back || n.select) this.onBack?.();
  }

  dispose(): void {
    this.root.remove();
  }
}
