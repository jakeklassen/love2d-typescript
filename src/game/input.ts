import { GamepadAxis, GamepadButton, Joystick } from 'love.joystick';
import { KeyConstant } from 'love.keyboard';
import { STICK_DEADZONE } from './constants';

// LÖVE-native input, exposing the same high-level `actions` the PixiJS build
// used (there via `contro`). Flight is on the left stick + keyboard; boost on
// the Right Trigger so the face buttons stay free to fire and charge:
//   forward/gas   = stick (any direction) or W/Up
//   brake         = Left Trigger or S/Down
//   steer         = stick angle (absolute aim) or D-pad / A,D / arrows
//   boost         = Right Trigger or Z
//   shoot         = A button or Space
//   homing charge = B button or X
const RAD_TO_DEG = 180 / Math.PI;
const TRIGGER_THRESHOLD = 0.5;

/** First connected standard-mapped gamepad, or undefined. */
function pad(): Joystick | undefined {
  for (const joystick of love.joystick.getJoysticks()) {
    if (joystick.isGamepad()) return joystick;
  }
  return undefined;
}

function key(...keys: KeyConstant[]): boolean {
  for (const k of keys) {
    if (love.keyboard.isDown(k)) return true;
  }
  return false;
}

function padDown(button: GamepadButton): boolean {
  const joystick = pad();
  return joystick !== undefined && joystick.isGamepadDown(button);
}

function axis(which: GamepadAxis): number {
  const joystick = pad();
  return joystick !== undefined ? joystick.getGamepadAxis(which) : 0;
}

/** Left-stick vector (up is -y in the standard mapping). Zeroed when no pad. */
function stick(): { x: number; y: number } {
  return { x: axis('leftx'), y: axis('lefty') };
}

/** Any stick deflection past the deadzone — "gas". The ship thrusts along its
 * nose (not toward the stick), so any push means forward. */
function stickPushed(): boolean {
  const s = stick();
  return s.x * s.x + s.y * s.y > STICK_DEADZONE * STICK_DEADZONE;
}

export const actions = {
  rotateLeft: (): boolean => key('left', 'a') || padDown('dpleft'),
  rotateRight: (): boolean => key('right', 'd') || padDown('dpright'),
  thrust: (): boolean => key('up', 'w') || stickPushed(),
  brake: (): boolean => key('down', 's') || axis('triggerleft') > TRIGGER_THRESHOLD,
  boost: (): boolean => key('z') || axis('triggerright') > TRIGGER_THRESHOLD,
  shoot: (): boolean => key('space') || padDown('a'),
  homing: (): boolean => key('x') || padDown('b'),

  /**
   * Absolute stick steering: the stick's angle is a target heading in world
   * space (stick up = north = rotation 0°). Returns degrees, or undefined when
   * the stick is centred (or no pad) so the digital rotate keys/D-pad apply.
   */
  steerHeading: (): number | undefined => {
    const s = stick();
    if (s.x * s.x + s.y * s.y <= STICK_DEADZONE * STICK_DEADZONE) return undefined;
    return Math.atan2(s.x, -s.y) * RAD_TO_DEG;
  },
};

/** True while a gamepad is connected (for HUD hints). */
export function gamepadConnected(): boolean {
  return pad() !== undefined;
}

/**
 * Rumble the pad. `strong` drives the low-frequency (heavy) motor, `weak` the
 * high-frequency one. Safe no-op when no pad is connected or it can't vibrate.
 */
export function rumble(durationMs: number, strong = 1, weak = 0.5): void {
  const joystick = pad();
  if (joystick === undefined) return;
  joystick.setVibration(strong, weak, durationMs / 1000);
}
