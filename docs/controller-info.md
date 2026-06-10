Here is the relevant implementation information for a **browser-based DJ web app** that talks to the Fri3d DJ addon.

## Main interface to use: Web MIDI

The DJ addon exposes itself as **USB MIDI**, and all physical controls are sent as **MIDI Control Change** messages. A browser app should use `navigator.requestMIDIAccess()` to enumerate MIDI inputs/outputs; MDN notes this requires a secure context and returns a `MIDIAccess` object for connected MIDI devices. ([MDN Web Docs][1])

The firmware sends USB MIDI packets as:

```txt
[0] CIN, usually 0x0B for Control Change
[1] MIDI status, 0xB0 | channel
[2] control number
[3] value
```

The channel is **MIDI channel 1**, encoded as channel `0` in MIDI status bytes. Control Change messages are sent with CIN `0x0B` and status `0xB0`. ([GitHub][2])

For Web MIDI, you normally receive the MIDI bytes only, so handle:

```js
status = 0xB0
control = data1
value = data2
```

## Control map

### Analog knobs and faders

The DJ addon has **6 potentiometers** and **3 sliders/faders**. ADC readings are scaled from 12-bit ADC to 7-bit MIDI using `adc >> 5`, then inverted before sending, so the web app receives values in the normal MIDI range `0–127`. A small hysteresis avoids noisy updates. ([GitHub][2])

| Control            | CC number |    Hex |
| ------------------ | --------: | -----: |
| Left top pot       |        64 | `0x40` |
| Left middle pot    |        65 | `0x41` |
| Left bottom pot    |        66 | `0x42` |
| Left slider/fader  |        67 | `0x43` |
| Right top pot      |        80 | `0x50` |
| Right middle pot   |        81 | `0x51` |
| Right bottom pot   |        82 | `0x52` |
| Right slider/fader |        83 | `0x53` |
| Middle/crossfader  |        89 | `0x59` |

### Buttons

There is a **3×3 button matrix**, but only **8 buttons are tracked**; the 9th position, col 2 / row 2, is ignored because it would overflow the `uint8_t` matrix state. Button changes are emitted as CC messages with value `127` when pressed and `0` when released. ([GitHub][2])

| Button index | Matrix position | CC number |    Hex |
| -----------: | --------------- | --------: | -----: |
|            0 | col 0 row 0     |       100 | `0x64` |
|            1 | col 0 row 1     |       102 | `0x66` |
|            2 | col 0 row 2     |       101 | `0x65` |
|            3 | col 1 row 0     |        96 | `0x60` |
|            4 | col 1 row 1     |        98 | `0x62` |
|            5 | col 1 row 2     |        97 | `0x61` |
|            6 | col 2 row 0     |       103 | `0x67` |
|            7 | col 2 row 1     |        99 | `0x63` |

### Scratch / rotary encoders

There are two quadrature encoders. Each one emits **two CCs**: one absolute position value, and one “activity” flag that goes `127` while turning and `0` when stopped. The counters wrap in the `0–127` range. ([GitHub][2])

| Encoder               | Position CC | Activity CC |
| --------------------- | ----------: | ----------: |
| Left scratch encoder  | `0x44` / 68 | `0x45` / 69 |
| Right scratch encoder | `0x54` / 84 | `0x55` / 85 |

A practical web-app interpretation:

```js
if (cc === 0x44) deckA.scratchPosition = value;
if (cc === 0x45) deckA.scratching = value === 127;

if (cc === 0x54) deckB.scratchPosition = value;
if (cc === 0x55) deckB.scratching = value === 127;
```

## LED control from the web app

The addon has **8 WS2812 RGB LEDs**. The host controls them by sending MIDI Control Change messages back to the device. LED CC numbers start at `0x20`, so LED index is:

```js
ledIndex = cc - 0x20
```

Valid LED CCs are:

| LED | CC number |    Hex |
| --: | --------: | -----: |
|   0 |        32 | `0x20` |
|   1 |        33 | `0x21` |
|   2 |        34 | `0x22` |
|   3 |        35 | `0x23` |
|   4 |        36 | `0x24` |
|   5 |        37 | `0x25` |
|   6 |        38 | `0x26` |
|   7 |        39 | `0x27` |

Send value `0` to turn an LED off. Send values `1–9` to select one of the firmware’s built-in palette colors. Values outside that range are ignored by the current firmware. ([GitHub][2])

```js
function setLed(midiOutput, ledIndex, paletteValue) {
  const cc = 0x20 + ledIndex;
  midiOutput.send([0xB0, cc, paletteValue]); // channel 1
}
```

Firmware palette values are:

| Value | Firmware comment |
| ----: | ---------------- |
|     0 | off              |
|     1 | orange-red       |
|     2 | teal             |
|     3 | yellow-green     |
|     4 | warm white       |
|     5 | blue             |
|     6 | cyan             |
|     7 | white            |
|     8 | bright white     |
|     9 | green            |

## Minimal Web MIDI skeleton

```js
const DJ_CC = {
  LEFT_TOP: 0x40,
  LEFT_MID: 0x41,
  LEFT_BOTTOM: 0x42,
  LEFT_FADER: 0x43,

  RIGHT_TOP: 0x50,
  RIGHT_MID: 0x51,
  RIGHT_BOTTOM: 0x52,
  RIGHT_FADER: 0x53,

  CROSSFADER: 0x59,

  SCRATCH_LEFT_POS: 0x44,
  SCRATCH_LEFT_ACTIVE: 0x45,
  SCRATCH_RIGHT_POS: 0x54,
  SCRATCH_RIGHT_ACTIVE: 0x55,
};

const BUTTON_CC = new Map([
  [0x64, "button_0"],
  [0x66, "button_1"],
  [0x65, "button_2"],
  [0x60, "button_3"],
  [0x62, "button_4"],
  [0x61, "button_5"],
  [0x67, "button_6"],
  [0x63, "button_7"],
]);

let midiOutput = null;

async function connectMidi() {
  const access = await navigator.requestMIDIAccess();

  for (const input of access.inputs.values()) {
    input.onmidimessage = onMidiMessage;
    console.log("MIDI input:", input.name);
  }

  for (const output of access.outputs.values()) {
    midiOutput = output;
    console.log("MIDI output:", output.name);
    break;
  }
}

function onMidiMessage(event) {
  const [status, cc, value] = event.data;
  const command = status & 0xF0;
  const channel = status & 0x0F;

  if (command !== 0xB0 || channel !== 0) return; // CC, MIDI channel 1

  if (BUTTON_CC.has(cc)) {
    const name = BUTTON_CC.get(cc);
    const pressed = value === 127;
    handleButton(name, pressed);
    return;
  }

  switch (cc) {
    case DJ_CC.LEFT_TOP:
    case DJ_CC.LEFT_MID:
    case DJ_CC.LEFT_BOTTOM:
    case DJ_CC.LEFT_FADER:
    case DJ_CC.RIGHT_TOP:
    case DJ_CC.RIGHT_MID:
    case DJ_CC.RIGHT_BOTTOM:
    case DJ_CC.RIGHT_FADER:
    case DJ_CC.CROSSFADER:
      handleAnalog(cc, value / 127);
      break;

    case DJ_CC.SCRATCH_LEFT_POS:
    case DJ_CC.SCRATCH_RIGHT_POS:
      handleScratchPosition(cc, value);
      break;

    case DJ_CC.SCRATCH_LEFT_ACTIVE:
    case DJ_CC.SCRATCH_RIGHT_ACTIVE:
      handleScratchActive(cc, value === 127);
      break;
  }
}

function setLed(ledIndex, paletteValue) {
  if (!midiOutput) return;
  midiOutput.send([0xB0, 0x20 + ledIndex, paletteValue]);
}
```

## I2C register map, useful if your web app talks through badge firmware instead of direct USB MIDI

The DJ addon is also an **I2C slave at address `0x3A`**, 400 kHz. It exposes a 50-byte register map; bytes before offset `0x1A` are read-only, and the LED region from `0x1A` onward is writable. ([GitHub][2])

| Offset | Size | Meaning                                    |
| -----: | ---: | ------------------------------------------ |
| `0x00` |    3 | firmware version `[major, minor, patch]`   |
| `0x03` |    1 | button matrix state bitmask                |
| `0x04` |   18 | 9 ADC channels as little-endian `uint16_t` |
| `0x16` |    2 | left encoder counter                       |
| `0x18` |    2 | right encoder counter                      |
| `0x1A` |   24 | LED data, 8 × `{G, R, B}`                  |

The badge 2026 expander firmware shows the same style of I2C register-map design at address `0x50`, with read-only inputs and writable outputs, which is relevant if you are building a bridge on the badge side. ([GitHub][3])

The communicator 2024 firmware is less directly relevant to the DJ app, but it confirms the same register-pointer I2C pattern: write an offset, then read or write the associated region. It also shows older offset-based commands for reading version/key reports and writing LEDs/backlight. ([GitHub][4])

## Recommended web-app model

Use this state shape:

```js
const state = {
  left: {
    eqHigh: 0,
    eqMid: 0,
    eqLow: 0,
    fader: 0,
    scratchPosition: 64,
    scratching: false,
  },
  right: {
    eqHigh: 0,
    eqMid: 0,
    eqLow: 0,
    fader: 0,
    scratchPosition: 64,
    scratching: false,
  },
  crossfader: 0,
  buttons: Array(8).fill(false),
  leds: Array(8).fill(0),
};
```

For the fastest first version: implement **Web MIDI input**, map the CCs above to UI/audio state, then add **MIDI output** for LEDs using CC `0x20–0x27`.

[1]: https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API?utm_source=chatgpt.com "Web MIDI API - MDN Web Docs - Mozilla"
[2]: https://raw.githubusercontent.com/Fri3dCamp/dj_2026/refs/heads/main/Firmware/src/main.c "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/Fri3dCamp/badge_2026_fw/refs/heads/main/src/main.c "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/Fri3dCamp/communicator_2024/refs/heads/main/Sources/src/main.c "raw.githubusercontent.com"
