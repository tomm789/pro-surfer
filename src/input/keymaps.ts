/** Keyboard layouts per player. Player 1 follows design doc §4.2; player 2 uses the left-hand cluster. */
export interface Keymap {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  jump: string[];
  carve: string[];
  grab: string[];
  slide: string[];
  spinLeft: string[];
  spinRight: string[];
  cashIn: string[];
  cameraToggle: string[];
  objectCam: string[];
  pause: string[];
}

export const KEYMAP_P1: Keymap = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  jump: ['Space'],
  carve: ['KeyJ'],
  grab: ['KeyK'],
  slide: ['KeyL'],
  spinLeft: ['KeyQ', 'KeyU'],
  spinRight: ['KeyE', 'KeyO'],
  cashIn: ['Enter', 'NumpadEnter'],
  cameraToggle: ['ShiftLeft', 'ShiftRight'],
  objectCam: ['Tab'],
  pause: ['Escape'],
};

/** Single-player also accepts WASD for movement. */
export const KEYMAP_SOLO: Keymap = {
  ...KEYMAP_P1,
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
};

export const KEYMAP_P2: Keymap = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['KeyF'],
  carve: ['KeyG'],
  grab: ['KeyH'],
  slide: ['KeyV'],
  spinLeft: ['KeyR'],
  spinRight: ['KeyT'],
  cashIn: ['KeyB'],
  cameraToggle: ['KeyC'],
  objectCam: ['KeyX'],
  pause: ['Escape'],
};

export function keymapHint(map: Keymap): string {
  const k = (codes: string[]) =>
    codes[0]!.replace('Key', '').replace('Arrow', '').replace('Numpad', '').replace('ShiftLeft', 'Shift').replace('Space', 'Space');
  return `${k(map.up)}/${k(map.down)}/${k(map.left)}/${k(map.right)} move · ${k(map.jump)} jump · ${k(map.carve)} carve · ${k(map.grab)} grab · ${k(map.slide)} slide · ${k(map.spinLeft)}/${k(map.spinRight)} spin · ${k(map.cashIn)} cash in`;
}
