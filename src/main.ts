import { App } from '@/app/app';
import { PlaceholderScene } from '@/scenes/placeholder';
import { WaveScene } from '@/scenes/waveScene';
import { RideScene } from '@/scenes/rideScene';
import { MainGameScene } from '@/scenes/gameScene';

const app = new App({
  game: () => new MainGameScene(),
  placeholder: () => new PlaceholderScene(),
  wave: () => new WaveScene(),
  ride: () => new RideScene(),
});

app.start().catch((err) => {
  console.error(err);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;margin:0;padding:16px;background:#200;color:#fbb;white-space:pre-wrap;z-index:99';
  el.textContent = String(err?.stack ?? err);
  document.body.appendChild(el);
});
