/** Trick book screen: every trick grouped by section with its input, greyed when locked. */
import type { Trick, TrickInput } from '@/tricks/catalogue';
import { TRICKS } from '@/tricks/catalogue';
import { ensureScreenCss, MenuNav } from './screens';
import type { RiderInput } from '@/rider/input';

const BTN: Record<string, string> = { carve: 'Carve (J / X)', grab: 'Grab (K / B)', slide: 'Slide (L / Y)' };
const DIRS: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→', upLeft: '↖', upRight: '↗', downLeft: '↙', downRight: '↘' };

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

export class TrickBookScreen {
  readonly root: HTMLDivElement;
  private nav = new MenuNav();
  onBack: (() => void) | null = null;
  private page = 0;
  private pages: { title: string; tricks: Trick[] }[];
  private body: HTMLDivElement;
  private title: HTMLHeadingElement;

  constructor(parent: HTMLElement, private unlocked: Set<string> | null) {
    ensureScreenCss();
    this.pages = [
      { title: 'FACE TRICKS', tricks: TRICKS.bySection('face').filter((t) => !t.special) },
      { title: 'FACE SPECIALS', tricks: TRICKS.bySection('face').filter((t) => t.special) },
      { title: 'AIR GRABS & FLIPS', tricks: TRICKS.bySection('air').filter((t) => !t.special) },
      { title: 'AIR SPECIALS', tricks: TRICKS.bySection('air').filter((t) => t.special) },
      { title: 'TUBE TRICKS', tricks: TRICKS.bySection('tube') },
      { title: 'EXIT MOVES', tricks: TRICKS.bySection('exit') },
    ];
    this.root = document.createElement('div');
    this.root.className = 'scr dim';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.minWidth = '720px';
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
    const table = document.createElement('table');
    for (const t of p.tricks) {
      const tr = document.createElement('tr');
      const locked = this.unlocked && t.special && !this.unlocked.has(t.id);
      const a = document.createElement('td');
      a.textContent = locked ? '??? (locked)' : t.name;
      const b = document.createElement('td');
      b.className = 'v';
      b.textContent = locked ? '—' : describeInput(t.input);
      const c = document.createElement('td');
      c.className = 'v';
      c.textContent = t.base ? t.base.toLocaleString('en-US') : '';
      tr.append(a, b, c);
      if (locked) tr.style.opacity = '0.45';
      table.appendChild(tr);
    }
    this.body.innerHTML = '';
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
