// Web MIDI interface for the Fri3d DJ addon.
// All physical controls arrive as Control Change messages on MIDI channel 1
// (channel 0 in the status byte). See docs/controller-info.md.

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
export const BUTTON_CC: Record<number, number> = {
  0x64: 0, // col 0 row 0
  0x66: 1, // col 0 row 1
  0x65: 2, // col 0 row 2
  0x60: 3, // col 1 row 0
  0x62: 4, // col 1 row 1
  0x61: 5, // col 1 row 2
  0x67: 6, // col 2 row 0
  0x63: 7, // col 2 row 1
};

// Firmware LED palette (value sent over CC 0x20..0x27).
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
  /** Connection / device status changed. */
  onStatus(status: MidiStatus, deviceName?: string): void;
}

export class MidiController {
  private access: MIDIAccess | null = null;
  private output: MIDIOutput | null = null;
  private events: MidiEvents;
  private ledState = new Array<number>(8).fill(0);
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
      const access = await navigator.requestMIDIAccess({ sysex: false });
      this.access = access;
      this.bindInputs();
      this.pickOutput();
      access.onstatechange = () => {
        this.bindInputs();
        this.pickOutput();
      };
      const name = this.firstInputName() ?? this.output?.name;
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
    return this.access.inputs.size > 0 || this.access.outputs.size > 0;
  }

  private firstInputName(): string | undefined {
    if (!this.access) return undefined;
    for (const input of this.access.inputs.values()) return input.name ?? undefined;
    return undefined;
  }

  private bindInputs(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (e) => this.handleMessage(e);
    }
  }

  private pickOutput(): void {
    if (!this.access) return;
    for (const output of this.access.outputs.values()) {
      this.output = output;
      return;
    }
    this.output = null;
  }

  private handleMessage(event: MIDIMessageEvent): void {
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

    if (cc in BUTTON_CC) {
      this.events.onButton(BUTTON_CC[cc], value === 127);
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
    this.output?.send([0xb0, LED_CC_BASE + index, color]);
    if (this.debug) {
      console.log(
        `%c[MIDI →]%c LED ${index} cc=${hex2(LED_CC_BASE + index)} color=${color}`,
        "color:#ffad64;font-weight:bold",
        "color:inherit",
      );
    }
  }

  /** Push all 8 LED colours at once. */
  setLeds(colors: number[]): void {
    for (let i = 0; i < 8; i++) this.setLed(i, colors[i] ?? 0);
  }
}

/** Signed delta between two wrapping 0..127 encoder positions. */
export function wrapDelta(prev: number, cur: number): number {
  let d = cur - prev;
  if (d > 64) d -= 128;
  if (d < -64) d += 128;
  return d;
}
