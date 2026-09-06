/** Scrapbook screen: a grid of photos with captions; stick to browse, back to leave, grab to delete. */
import type { RiderInput } from '@/rider/input';
import type { ScrapbookPhoto } from '@/save/scrapbook';
import { ensureScreenCss, MenuNav } from './screens';

let cssDone = false;
function ensureCss(): void {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
.scrap .panel{max-width:1140px;width:92%}
.scrap .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;max-width:1100px;margin:18px auto 0}
.scrap .ph{position:relative;border:3px solid rgba(255,255,255,.18);border-radius:8px;overflow:hidden;background:#0b1e2c;transform:rotate(-1.2deg);transition:transform .15s,border-color .15s}
.scrap .ph:nth-child(2n){transform:rotate(1.1deg)}
.scrap .ph.sel{border-color:#ffe27a;transform:scale(1.06) rotate(0);box-shadow:0 10px 30px rgba(0,0,0,.6);z-index:2}
.scrap .ph img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
.scrap .ph .cap{position:absolute;left:0;right:0;bottom:0;padding:6px 8px;font:700 12px/1.2 "Trebuchet MS",sans-serif;color:#fff;background:linear-gradient(0deg,rgba(0,0,0,.75),transparent);text-shadow:0 1px 2px #000}
.scrap .ph .cap b{color:#ffe27a;float:right}
.scrap .empty{text-align:center;color:#cfe8f5;font:700 18px/1.5 "Trebuchet MS",sans-serif;margin:60px 0}
.scrap .big{margin-bottom:0}
`;
  document.head.appendChild(s);
}

export class ScrapbookScreen {
  readonly root: HTMLDivElement;
  private nav = new MenuNav();
  private selected = 0;
  private prevX = 0;
  private prevGrab = false;
  private tiles: HTMLDivElement[] = [];
  onBack: (() => void) | null = null;
  onDelete: ((id: number) => void) | null = null;

  constructor(
    parent: HTMLElement,
    private photos: ScrapbookPhoto[],
  ) {
    ensureScreenCss();
    ensureCss();
    this.root = document.createElement('div');
    this.root.className = 'scr dim scrap';
    this.root.innerHTML = `<div class="panel wide"><h1>SCRAPBOOK</h1><div class="grid"></div><div class="foot"></div></div>`;
    parent.appendChild(this.root);
    this.build();
  }

  private build(): void {
    const grid = this.root.querySelector('.grid') as HTMLDivElement;
    grid.innerHTML = '';
    this.tiles = [];
    if (!this.photos.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'No photos yet. Photo goals in the career save shots here, and K / B during a replay takes a snapshot.';
      grid.appendChild(e);
    }
    for (const p of this.photos) {
      const tile = document.createElement('div');
      tile.className = 'ph';
      const img = document.createElement('img');
      img.src = p.data;
      img.alt = p.caption;
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.innerHTML = `${p.caption} · ${p.beach}<b>${p.value ? p.value.toLocaleString('en-US') : ''}</b>`;
      tile.append(img, cap);
      grid.appendChild(tile);
      this.tiles.push(tile);
    }
    this.selected = Math.min(this.selected, Math.max(0, this.tiles.length - 1));
    this.refresh();
    const foot = this.root.querySelector('.foot') as HTMLDivElement;
    foot.textContent = this.photos.length ? 'stick: browse · K / B: delete photo · Esc / B: back' : 'Esc / back';
  }

  private refresh(): void {
    this.tiles.forEach((t, i) => t.classList.toggle('sel', i === this.selected));
  }

  prime(input: Readonly<RiderInput>): void {
    this.nav.prime(input);
    this.prevGrab = input.grab;
  }

  update(input: Readonly<RiderInput>, dt: number): void {
    const n = this.nav.read(input, dt);
    const cols = 4;
    if (n.move) this.selected = Math.max(0, Math.min(this.tiles.length - 1, this.selected + n.move * cols));
    const x = input.stickX > 0.5 ? 1 : input.stickX < -0.5 ? -1 : 0;
    if (x && x !== this.prevX) this.selected = Math.max(0, Math.min(this.tiles.length - 1, this.selected + x));
    this.prevX = x;
    this.refresh();
    const grab = input.grab && !this.prevGrab;
    this.prevGrab = input.grab;
    if (grab && this.photos[this.selected] && this.onDelete) {
      const id = this.photos[this.selected]!.id;
      this.onDelete(id);
      this.photos = this.photos.filter((p) => p.id !== id);
      this.build();
      return;
    }
    if (n.back || (n.select && !this.photos.length)) this.onBack?.();
  }

  dispose(): void {
    this.root.remove();
  }
}
