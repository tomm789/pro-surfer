import { cloneInput, NEUTRAL_INPUT, type RiderInput } from '@/rider/input';
import { quantiseAxis } from '@/core/replay';
import { KEYMAP_SOLO, type Keymap } from './keymaps';

/**
 * Presentation-layer input: keyboard + Gamepad API → RiderInput, per player.
 * Gamepad (standard mapping): stick/d-pad · A jump · X carve · B grab · Y slide/stand · LB/RB spin ·
 * R3 cash-in · LT camera · RT object cam · Start pause.
 */
export class InputManager {
  private keys = new Set<string>();
  private input: RiderInput = cloneInput(NEUTRAL_INPUT);
  private deadzone: number;
  /** Set when any key/button was pressed at least once (audio unlock, gamepad user gesture). */
  anyInputSeen = false;
  /** Which gamepad index this player uses; null = first connected pad. */
  gamepadIndex: number | null;
  gamepadName = '';
  /** When true, ignore gamepads entirely (keyboard-only player). */
  keyboardOnly = false;
  /** Stick scheme options (docs/MECHANICS.md §10): the right stick is the back foot; stick up presses. */
  swapFeet = false;
  invertPress = false;
  /** Nintendo pads label the same physical positions A/B/X/Y the other way round; swap so the labels match. */
  buttonLayout: 'standard' | 'nintendo' = 'standard';
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    this.anyInputSeen = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => this.keys.clear();

  constructor(
    deadzone = 0.22,
    private keymap: Keymap = KEYMAP_SOLO,
    gamepadIndex: number | null = null,
  ) {
    this.deadzone = deadzone;
    this.gamepadIndex = gamepadIndex;
  }

  setKeymap(map: Keymap): void {
    this.keymap = map;
  }

  attach(target: Window = window): void {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    target.addEventListener('gamepadconnected', (e) => {
      const gp = (e as GamepadEvent).gamepad;
      if (this.gamepadIndex === null || gp.index === this.gamepadIndex) this.gamepadName = gp.id;
      this.anyInputSeen = true;
    });
  }

  detach(target: Window = window): void {
    target.removeEventListener('keydown', this.onKeyDown);
    target.removeEventListener('keyup', this.onKeyUp);
    target.removeEventListener('blur', this.onBlur);
  }

  private key(codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Which pad this player reads: the configured index, else the first connected pad. */
  private pad(): Gamepad | null {
    if (this.keyboardOnly || typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.gamepadIndex !== null) return pads[this.gamepadIndex] ?? null;
    for (const p of pads) if (p) return p;
    return null;
  }

  /** Poll and return the current input. Call once per rendered frame. */
  poll(): Readonly<RiderInput> {
    const i = this.input;
    const m = this.keymap;
    let x = (this.key(m.right) ? 1 : 0) - (this.key(m.left) ? 1 : 0);
    let y = (this.key(m.up) ? 1 : 0) - (this.key(m.down) ? 1 : 0);
    i.jump = this.key(m.jump);
    i.carve = this.key(m.carve);
    i.grab = this.key(m.grab);
    i.slide = this.key(m.slide);
    i.spinLeft = this.key(m.spinLeft);
    i.spinRight = this.key(m.spinRight);
    i.cashIn = this.key(m.cashIn);
    i.cameraToggle = this.key(m.cameraToggle);
    i.objectCam = this.key(m.objectCam);
    i.pause = this.key(m.pause);
    i.stand = i.slide;
    i.duckDive = i.grab;

    const gp = this.pad();
    if (gp) {
      if (!this.gamepadName) this.gamepadName = gp.id;
      const ax = gp.axes[0] ?? 0;
      const ay = -(gp.axes[1] ?? 0);
      const mag = Math.hypot(ax, ay);
      if (mag > this.deadzone) {
        const scale = Math.min(1, (mag - this.deadzone) / (1 - this.deadzone)) / mag;
        x = x || ax * scale;
        y = y || ay * scale;
      }
      const swap = this.buttonLayout === 'nintendo' ? { 0: 1, 1: 0, 2: 3, 3: 2 } : ({} as Record<number, number>);
      const b = (n: number) => !!gp.buttons[swap[n] ?? n]?.pressed;
      if (b(12)) y = 1;
      if (b(13)) y = -1;
      if (b(14)) x = -1;
      if (b(15)) x = 1;
      i.jump ||= b(0);
      i.grab ||= b(1);
      i.carve ||= b(2);
      i.slide ||= b(3);
      i.spinLeft ||= b(4);
      i.spinRight ||= b(5);
      i.cameraToggle ||= b(6);
      i.objectCam ||= b(7);
      i.pause ||= b(9);
      i.cashIn ||= b(11);
      i.stand ||= b(3);
      i.duckDive ||= b(1);
      if (gp.buttons.some((bt) => bt.pressed) || mag > 0.5) this.anyInputSeen = true;
    }
    // sticks are quantised to the replay grid so a saved replay reproduces the run bit for bit and
    // analogue jitter does not turn every frame into a recorded key
    i.stickX = quantiseAxis(x);
    i.stickY = quantiseAxis(y);

    // feet (docs/MECHANICS.md): left stick = back foot, right stick = front foot.
    // A classic keymap leaves these at zero and the simulation derives them from the single stick.
    let bx = 0;
    let by = 0;
    let fx = 0;
    let fy = 0;
    if (m.backUp) {
      bx = (this.key(m.backRight!) ? 1 : 0) - (this.key(m.backLeft!) ? 1 : 0);
      by = (this.key(m.backUp) ? 1 : 0) - (this.key(m.backDown!) ? 1 : 0);
      fx = (this.key(m.frontRight!) ? 1 : 0) - (this.key(m.frontLeft!) ? 1 : 0);
      fy = (this.key(m.frontUp!) ? 1 : 0) - (this.key(m.frontDown!) ? 1 : 0);
    }
    if (gp) {
      const dead = (v: number) => (Math.abs(v) > this.deadzone ? Math.sign(v) * Math.min(1, (Math.abs(v) - this.deadzone) / (1 - this.deadzone)) : 0);
      bx = bx || dead(gp.axes[0] ?? 0);
      by = by || -dead(gp.axes[1] ?? 0);
      fx = fx || dead(gp.axes[2] ?? 0);
      fy = fy || -dead(gp.axes[3] ?? 0);
    }
    // player options: which stick is the back foot, and which way on a stick presses the foot down
    if (this.invertPress) {
      by = -by;
      fy = -fy;
    }
    if (this.swapFeet) {
      [bx, by, fx, fy] = [fx, fy, bx, by];
    }
    i.backX = quantiseAxis(bx);
    i.backY = quantiseAxis(by);
    i.frontX = quantiseAxis(fx);
    i.frontY = quantiseAxis(fy);
    return i;
  }

  /** Dual-rumble if the pad supports it (Chrome, Safari 17+). Silently no-ops elsewhere. */
  rumble(strong: number, weak: number, ms: number): void {
    const p = this.pad();
    const act = (p as unknown as { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } } | null)?.vibrationActuator;
    if (act?.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => undefined);
  }

  /** Number of connected gamepads (for multiplayer setup). */
  static padCount(): number {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return 0;
    let n = 0;
    for (const p of navigator.getGamepads()) if (p) n++;
    return n;
  }

  get pressedKeys(): ReadonlySet<string> {
    return this.keys;
  }
}
