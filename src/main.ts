import { App } from '@/app/app';
import { PlaceholderScene } from '@/scenes/placeholder';
import { WaveScene } from '@/scenes/waveScene';

const app = new App({
  placeholder: () => new PlaceholderScene(),
  wave: () => new WaveScene(),
});

app.start().catch((err) => {
  console.error(err);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;margin:0;padding:16px;background:#200;color:#fbb;white-space:pre-wrap;z-index:99';
  el.textContent = String(err?.stack ?? err);
  document.body.appendChild(el);
});
