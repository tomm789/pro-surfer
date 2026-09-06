import { cloneInput, NEUTRAL_INPUT, type RiderInput } from '@/rider/input';

/**
 * Presentation-layer input: keyboard + Gamepad API → RiderInput. Mapping follows design doc §4.2.
 * Keyboard: arrows/WASD stick · Space jump · J carve · K grab/duck-dive · L slide/floater/stand ·
 * Q/E spin · Enter cash-in · Shift camera · Tab object cam · Esc pause.
 * Gamepad (standard mapping): stick/d-pad · A jump · X carve · B grab · Y slide/stand · LB/RB spin ·
 * R3 cash-in · LT camera · RT object cam · Start pause.
 */
export class InputManager {
  private keys = new Set<string>();
  private input: RiderInput = cloneInput(NEUTRAL_INPUT);
  private deadzone: number;
  /** Set when any key/button was pressed at least once (audio unlock, gamepad user gesture). */
  anyInputSeen = false;
  gamepadIndex: number | null = null;
  gamepadName = '';
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

  constructor(deadzone = 0.22) {
    this.deadzone = deadzone;
  }

  attach(target: Window = window): void {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    target.addEventListener('gamepadconnected', (e) => {
      const gp = (e as GamepadEvent).gamepad;
      this.gamepadIndex = gp.index;
      this.gamepadName = gp.id;
      this.anyInputSeen = true;
    });
    target.addEventListener('gamepaddisconnected', (e) => {
      if ((e as GamepadEvent).gamepad.index === this.gamepadIndex) this.gamepadIndex = null;
    });
  }

  detach(target: Window = window): void {
    target.removeEventListener('keydown', this.onKeyDown);
    target.removeEventListener('keyup', this.onKeyUp);
    target.removeEventListener('blur', this.onBlur);
  }

  private key(...codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Poll and return the current input. Call once per rendered frame. */
  poll(): Readonly<RiderInput> {
    const i = this.input;
    // keyboard
    let x = (this.key('ArrowRight', 'KeyD') ? 1 : 0) - (this.key('ArrowLeft', 'KeyA') ? 1 : 0);
    let y = (this.key('ArrowUp', 'KeyW') ? 1 : 0) - (this.key('ArrowDown', 'KeyS') ? 1 : 0);
    i.jump = this.key('Space');
    i.carve = this.key('KeyJ');
    i.grab = this.key('KeyK');
    i.slide = this.key('KeyL');
    i.spinLeft = this.key('KeyQ');
    i.spinRight = this.key('KeyE');
    i.cashIn = this.key('Enter', 'NumpadEnter');
    i.cameraToggle = this.key('ShiftLeft', 'ShiftRight');
    i.objectCam = this.key('Tab');
    i.pause = this.key('Escape');
    i.stand = i.slide;
    i.duckDive = i.grab;

    // gamepad
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) {
      if (p && (this.gamepadIndex === null || p.index === this.gamepadIndex)) {
        gp = p;
        break;
      }
    }
    if (gp) {
      const ax = gp.axes[0] ?? 0;
      const ay = -(gp.axes[1] ?? 0);
      const mag = Math.hypot(ax, ay);
      if (mag > this.deadzone) {
        const scale = Math.min(1, (mag - this.deadzone) / (1 - this.deadzone)) / mag;
        x = x || ax * scale;
        y = y || ay * scale;
      }
      const b = (n: number) => !!gp!.buttons[n]?.pressed;
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
    i.stickX = Math.max(-1, Math.min(1, x));
    i.stickY = Math.max(-1, Math.min(1, y));
    return i;
  }

  /** Dual-rumble if the pad supports it (Chrome, Safari 17+). Silently no-ops elsewhere. */
  rumble(strong: number, weak: number, ms: number): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      const act = (p as unknown as { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } } | null)?.vibrationActuator;
      if (act?.playEffect) {
        act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => undefined);
      }
    }
  }
}
