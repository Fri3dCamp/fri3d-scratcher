// Web MIDI interface for Fri3d DJ addon and BLOOPPAD-MAXX.
// Both controllers use Control Change messages on MIDI channel 1
// (channel 0 in status byte). See docs/controller-info.md.

export type DeckSide = "left" | "right";
export type EqBand = "high" | "mid" | "low";

// Control Change numbers exposed by the firmware.
export const CC = {
  // Left deck (deck A)
  LEFT_TOP: 0x40, // EQ high
  LEFT_MID: 0x41, // EQ mid
  LEFT_BOTTOM: 0x42, // EQ low
  LEFT_FADER: 0x43, // volume

  // Right deck (deck B)
  RIGHT_TOP: 0x50,
  RIGHT_MID: 0x51,
  RIGHT_BOTTOM: 0x52,
  RIGHT_FADER: 0x53,

  CROSSFADER: 0x59,

  SCRATCH_LEFT_POS: 0x44,
  SCRATCH_LEFT_ACTIVE: 0x45,
  SCRATCH_RIGHT_POS: 0x54,
  SCRATCH_RIGHT_ACTIVE: 0x55,
} as const;

// The 3x3 matrix exposes 8 usable buttons. Order them 0..7 the way the
// firmware indexes them so the UI pads line up with the hardware.
// ordered from top left to bottom right in 2 rows
// modulo 4; 0 = play, 1 = hot 2, 2 = hot 1, 3 = cue
export const BUTTON_CC: Record<number, number> = {
  0x60: 3, // col 1 row 0 -- top row button 1 // deck 1 cue
  0x61: 2, // col 1 row 2 -- top row button 2 // deck 1 hot 1
  0x62: 6, // col 1 row 1 -- top row button 3 // deck 2 hot 1
  0x63: 7, // col 2 row 1 -- top row button 4 // deck 2 cue
  0x64: 0, // col 0 row 0 -- bottom row button 1 // deck 1 play
  0x65: 1, // col 0 row 2 -- bottom row button 2 // deck 1 hot 2
  0x66: 5, // col 0 row 1 -- bottom row button 3 // deck 2 hot 2
  0x67: 4, // col 2 row 0 -- bottom row button 4 // deck 2 play
};

// Firmware LED palette, sent as a raw CC value for the addon LEDs (setLed).
// The BLOOPPAD-MAXX grid takes direct RGB instead — see setBloopPadLed/setBloopPadLeds.
export const LED_COLOR = {
  OFF: 0,
  ORANGE_RED: 1,
  TEAL: 2,
  YELLOW_GREEN: 3,
  WARM_WHITE: 4,
  BLUE: 5,
  CYAN: 6,
  WHITE: 7,
  BRIGHT_WHITE: 8,
  GREEN: 9,
} as const;

const LED_CC_BASE = 0x20;
// LED CC slots (0x20..0x27) follow the same physical matrix order as button
// CCs (0x60..0x67), not the logical 0..7 button indices used by onButton.
// Map logical button index -> physical LED slot.
const LED_SLOT_FOR_BUTTON = [4, 5, 1, 0, 7, 6, 2, 3] as const;

// SysEx LED RGB protocol: F0 13 37 <led> <red> <green> <blue> [<led> <red> <green> <blue> ...] F7.
// Multiple <led><red><green><blue> patterns can be packed into a single
// message to update many LEDs at once. Data bytes are limited to 0x7F, so
// 8-bit colour components are right-shifted by one bit before being sent.
type LedRgbEntry = readonly [index: number, r: number, g: number, b: number];
const SYSEX_MANUFACTURER = [0x13, 0x37];
const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;

function toSysexColorByte(value: number): number {
  return Math.max(0, Math.min(255, value | 0)) >> 1;
}

const SATURATION_BOOST = 2.0;

// Push an RGB colour's saturation up by scaling each channel's distance from
// the colour's mean outward, so it reads vividly on the LEDs (which otherwise
// look washed out next to their on-screen source colour). Unlike a plain HSL
// saturation boost — which caps out once a colour hits full saturation — this
// keeps responding as the boost factor increases, clipping toward pure,
// neon-bright primaries instead of flattening out.
function saturateRgb(r: number, g: number, b: number): readonly [number, number, number] {
  const mean = (r + g + b) / 3;
  const push = (channel: number) => Math.max(0, Math.min(255, Math.round(mean + (channel - mean) * SATURATION_BOOST)));
  return [push(r), push(g), push(b)];
}

// Human-readable names for known CC numbers, for debug logging.
const CC_NAMES: Record<number, string> = {
  [CC.LEFT_TOP]: "LEFT_TOP (low)",
  [CC.LEFT_MID]: "LEFT_MID (mid)",
  [CC.LEFT_BOTTOM]: "LEFT_BOTTOM (high)",
  [CC.LEFT_FADER]: "LEFT_FADER (volume)",
  [CC.RIGHT_TOP]: "RIGHT_TOP (low)",
  [CC.RIGHT_MID]: "RIGHT_MID (mid)",
  [CC.RIGHT_BOTTOM]: "RIGHT_BOTTOM (high)",
  [CC.RIGHT_FADER]: "RIGHT_FADER (volume)",
  [CC.CROSSFADER]: "CROSSFADER",
  [CC.SCRATCH_LEFT_POS]: "SCRATCH_LEFT_POS",
  [CC.SCRATCH_LEFT_ACTIVE]: "SCRATCH_LEFT_ACTIVE",
  [CC.SCRATCH_RIGHT_POS]: "SCRATCH_RIGHT_POS",
  [CC.SCRATCH_RIGHT_ACTIVE]: "SCRATCH_RIGHT_ACTIVE",
};

function ccLabel(cc: number): string {
  if (cc in CC_NAMES) return CC_NAMES[cc];
  if (cc in BUTTON_CC) return `BUTTON_${BUTTON_CC[cc]}`;
  return "unknown";
}

const hex2 = (n: number) => `0x${n.toString(16).padStart(2, "0")}`;

// Virtual/software MIDI ports that OSes always expose, unrelated to any
// connected hardware. Never treat these as the DJ addon: on Linux ALSA's
// "Midi Through" loops writes straight back to its own paired input, which
// looks like the addon echoing back whatever CC we just sent it.
const VIRTUAL_PORT_NAMES = [/midi through/i, /microsoft gs wavetable synth/i];

function isRealDevice(name: string | null | undefined): boolean {
  if (!name) return true;
  return !VIRTUAL_PORT_NAMES.some((re) => re.test(name));
}

// Two legitimate ways to reach the addon report different names, and we
// require a positive match against one of them rather than falling back to
// "the first non-virtual port": OSes/browsers always expose at least one
// synthetic port even with no hardware attached at all (e.g. Chromium backs
// its Web MIDI implementation on Linux with ALSA "WebMIDI input/output"
// wrapper clients around the "Midi Through" loopback, generically named
// "Input connection"/"Output connection" — those pass a loose "not virtual"
// filter and would otherwise be reported as a connected controller when
// nothing is actually plugged in).
//   - "dj2026 MIDI 1": the addon's own firmware, when its USB-C port is
//     connected directly to this computer.
//   - "Fri3d Badge DJ Addon MIDI 1": the Fri3d badge's USB MIDI interface,
//     when the addon is attached to the badge (I2C/UART) and the badge's own
//     USB-C port is what's connected instead; the badge's MicroPythonOS
//     DJ Addon app relays the addon's UART MIDI traffic over this port.
//   - "Espressif Device MIDI 1": same as above, but on a badge running an
//     older MicroPythonOS build from before it set a custom USB product
//     string (MicroPython's generic default name).
const ADDON_PORT_NAME = /dj.?2026|fri3d|espressif/i;

function isAddonPort(name: string | null | undefined): boolean {
  return isRealDevice(name) && ADDON_PORT_NAME.test(name ?? "");
}

function pickBestPort<T extends { name?: string | null }>(ports: Iterable<T>): T | null {
  for (const port of ports) {
    if (isAddonPort(port.name)) return port;
  }
  return null;
}

// Current BLOOPPAD-MAXX firmware identifies itself as CH32X035-MIDI. Keep
// product-name matches too so future firmware can use a friendlier USB name.
function isBloopPadPort(port: MIDIPort): boolean {
  return isRealDevice(port.name) && /bloop.?pad|ch32x035-midi/i.test(port.name ?? "");
}

export type MidiStatus = "unsupported" | "idle" | "connecting" | "connected" | "error";

export interface MidiEvents {
  /** A pot or fader moved. value is normalised 0..1. */
  onAnalog(cc: number, value: number): void;
  /** Absolute scratch encoder position, 0..127 wrapping. */
  onScratchPosition(side: DeckSide, position: number): void;
  /** Scratch activity flag. */
  onScratchActive(side: DeckSide, active: boolean): void;
  /** A matrix button changed. index 0..7. */
  onButton(index: number, pressed: boolean): void;
  /** A BLOOPPAD-MAXX grid button changed. */
  onBloopPadButton?(row: number, column: number, pressed: boolean): void;
  /** Connection / device status changed. */
  onStatus(status: MidiStatus, deviceName?: string): void;
}

export class MidiController {
  private access: MIDIAccess | null = null;
  private output: MIDIOutput | null = null;
  private bloopPadOutput: MIDIOutput | null = null;
  private events: MidiEvents;
  private ledState = new Array<number>(8).fill(-1);
  /** Packed (r<<16|g<<8|b) per-LED cache for the BLOOPPAD-MAXX SysEx RGB path. */
  private bloopPadLedRgbState = new Array<number>(64).fill(-1);
  private bloopPadButtonState = new Array<boolean>(64).fill(false);
  /** Last known pressed state per button index, to debounce duplicate firmware events. */
  private buttonState = new Array<boolean>(8).fill(false);
  /** When true, every in/out MIDI message is logged to the console. */
  debug: boolean;

  constructor(events: MidiEvents, debug = true) {
    this.events = events;
    this.debug = debug;
  }

  get supported(): boolean {
    return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
  }

  async connect(): Promise<void> {
    if (!this.supported) {
      this.events.onStatus("unsupported");
      return;
    }
    this.events.onStatus("connecting");
    try {
      const access = await navigator.requestMIDIAccess({ sysex: true });
      this.access = access;
      this.bindInputs();
      this.pickOutputs();
      access.onstatechange = () => {
        this.bindInputs();
        this.pickOutputs();
      };
      const name = this.deviceNames() || undefined;
      if (this.debug) {
        const inputs = [...access.inputs.values()].map((i) => i.name).join(", ") || "none";
        const outputs = [...access.outputs.values()].map((o) => o.name).join(", ") || "none";
        console.log(`%c[MIDI]%c connected. inputs: ${inputs} | outputs: ${outputs}`, "color:#8835c9;font-weight:bold", "color:inherit");
      }
      this.events.onStatus(this.hasDevice() ? "connected" : "idle", name ?? undefined);
    } catch {
      this.events.onStatus("error");
    }
  }

  private hasDevice(): boolean {
    if (!this.access) return false;
    if (pickBestPort(this.access.inputs.values()) != null || pickBestPort(this.access.outputs.values()) != null) return true;
    for (const port of [...this.access.inputs.values(), ...this.access.outputs.values()]) {
      if (isBloopPadPort(port)) return true;
    }
    return false;
  }

  private deviceNames(): string {
    if (!this.access) return "";
    const names = new Set<string>();
    for (const input of this.access.inputs.values()) if (input.name && isRealDevice(input.name)) names.add(input.name);
    for (const output of this.access.outputs.values()) if (output.name && isRealDevice(output.name)) names.add(output.name);
    return [...names].join(" + ");
  }

  private bindInputs(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      if (isAddonPort(input.name)) {
        input.onmidimessage = (e) => this.handleMessage(e, false);
      } else if (isBloopPadPort(input)) {
        input.onmidimessage = (e) => this.handleMessage(e, true);
      } else {
        input.onmidimessage = null;
      }
    }
  }

  private pickOutputs(): void {
    this.output = null;
    this.bloopPadOutput = null;
    if (!this.access) return;
    this.output = pickBestPort(this.access.outputs.values());
    for (const output of this.access.outputs.values()) {
      if (isBloopPadPort(output)) {
        this.bloopPadOutput = output;
        break;
      }
    }
    // Force a full refresh when a controller reconnects.
    this.ledState.fill(-1);
    this.bloopPadLedRgbState.fill(-1);
  }

  private handleMessage(event: MIDIMessageEvent, bloopPad: boolean): void {
    const data = event.data;
    if (!data || data.length < 3) return;
    const [status, cc, value] = data;
    const command = status & 0xf0;
    const channel = status & 0x0f;

    if (this.debug) {
      console.log(
        `%c[MIDI ←]%c status=${hex2(status)} cc=${cc} (${hex2(cc)}) value=${value}  ${ccLabel(cc)}`,
        "color:#3ce8b3;font-weight:bold",
        "color:inherit",
      );
    }

    if (command !== 0xb0 || channel !== 0) return; // Control Change, channel 1

    if (bloopPad) {
      const row = cc >> 4;
      const column = cc & 0x0f;
      if (row < 8 && column < 8) {
        const index = row * 8 + column;
        const pressed = value > 0;
        if (this.bloopPadButtonState[index] === pressed) return;
        this.bloopPadButtonState[index] = pressed;
        this.events.onBloopPadButton?.(row, column, pressed);
      }
      return;
    }

    if (cc in BUTTON_CC) {
      const index = BUTTON_CC[cc];
      const pressed = value === 127;
      // The firmware can emit repeated messages for the same physical state
      // (e.g. two press events with no release in between). Only forward the
      // event when the button state actually changes.
      if (this.buttonState[index] === pressed) return;
      this.buttonState[index] = pressed;
      this.events.onButton(index, pressed);
      return;
    }

    switch (cc) {
      case CC.LEFT_TOP:
      case CC.LEFT_MID:
      case CC.LEFT_BOTTOM:
      case CC.LEFT_FADER:
      case CC.RIGHT_TOP:
      case CC.RIGHT_MID:
      case CC.RIGHT_BOTTOM:
      case CC.RIGHT_FADER:
      case CC.CROSSFADER:
        this.events.onAnalog(cc, value / 127);
        break;
      case CC.SCRATCH_LEFT_POS:
        this.events.onScratchPosition("left", value);
        break;
      case CC.SCRATCH_RIGHT_POS:
        this.events.onScratchPosition("right", value);
        break;
      case CC.SCRATCH_LEFT_ACTIVE:
        this.events.onScratchActive("left", value === 127);
        break;
      case CC.SCRATCH_RIGHT_ACTIVE:
        this.events.onScratchActive("right", value === 127);
        break;
    }
  }

  /** Light a single LED (index 0..7) with a firmware palette value. */
  setLed(index: number, color: number): void {
    if (index < 0 || index > 7) return;
    if (this.ledState[index] === color) return;
    this.ledState[index] = color;
    const slot = LED_SLOT_FOR_BUTTON[index] ?? index;
    this.output?.send([0xb0, LED_CC_BASE + slot, color]);
    if (this.debug) {
      console.log(
        `%c[MIDI →]%c LED ${index} slot=${slot} cc=${hex2(LED_CC_BASE + slot)} color=${color}`,
        "color:#ffad64;font-weight:bold",
        "color:inherit",
      );
    }
  }

  /** Push all 8 LED colours at once. */
  setLeds(colors: number[]): void {
    for (let i = 0; i < 8; i++) this.setLed(i, colors[i] ?? 0);
  }

  /** Light one BLOOPPAD-MAXX cell with a full RGB colour via SysEx. Components are 0..255. */
  setBloopPadLed(row: number, column: number, r: number, g: number, b: number): void {
    if (row < 0 || row > 7 || column < 0 || column > 7) return;
    const arrayIndex = row * 8 + column;
    const packed = (r << 16) | (g << 8) | b;
    if (this.bloopPadLedRgbState[arrayIndex] === packed) return;
    this.bloopPadLedRgbState[arrayIndex] = packed;
    const wireIndex = (row << 4) | (0x08 + column);
    this.sendBloopPadRgb([[wireIndex, r, g, b]]);
  }

  /** Push row-major RGB colours for all 64 BLOOPPAD-MAXX LEDs, as one SysEx message. Components are 0..255. */
  setBloopPadLeds(colors: readonly (readonly [number, number, number])[]): void {
    const entries: LedRgbEntry[] = [];
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        const arrayIndex = row * 8 + column;
        const [r, g, b] = colors[arrayIndex] ?? [0, 0, 0];
        const packed = (r << 16) | (g << 8) | b;
        if (this.bloopPadLedRgbState[arrayIndex] === packed) continue;
        this.bloopPadLedRgbState[arrayIndex] = packed;
        entries.push([(row << 4) | (0x08 + column), r, g, b]);
      }
    }
    this.sendBloopPadRgb(entries);
  }

  /** Send one or more <led><r><g><b> patterns to the BLOOPPAD-MAXX in a single SysEx message. */
  private sendBloopPadRgb(entries: LedRgbEntry[]): void {
    if (!this.bloopPadOutput || entries.length === 0) return;
    const saturated: LedRgbEntry[] = entries.map(([index, r, g, b]) => [index, ...saturateRgb(r, g, b)]);
    const message = [
      SYSEX_START,
      ...SYSEX_MANUFACTURER,
      ...saturated.flatMap(([index, r, g, b]) => [index, toSysexColorByte(r), toSysexColorByte(g), toSysexColorByte(b)]),
      SYSEX_END,
    ];
    this.bloopPadOutput.send(message);
    if (this.debug) {
      const summary = saturated.map(([index, r, g, b]) => `${index}:rgb(${r},${g},${b})`).join(" ");
      console.log(`%c[MIDI →]%c BLOOPPAD sysex ${entries.length} led(s): ${summary}`, "color:#ffad64;font-weight:bold", "color:inherit");
    }
  }
}

/** Signed delta between two wrapping 0..127 encoder positions. */
export function wrapDelta(prev: number, cur: number): number {
  let d = cur - prev;
  if (d > 64) d -= 128;
  if (d < -64) d += 128;
  return d;
}
