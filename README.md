# Fri3d-scratcher

A browser-based, two-deck DJ mixer that works with the [**Fri3d DJ addon**](https://fri3dcamp.github.io/badge_2026/dj/) over
**Web MIDI**, which loads local music files. It also works just with mouse controls.

Built with Vite + React + TypeScript + Tailwind CSS v4.

## Features

- **Two decks** with independent playback, loaded from your own audio files.
- **3-band EQ** (low / mid / high), volume fader and an equal-power
  **crossfader**, all powered by the Web Audio API.
- **Waveform** per deck with a played/unplayed split, a playhead, and
  click-to-seek.
- **Scratch platters** that spin while playing and respond to the hardware
  scratch encoders or mouse drag.
- **Transport pads**: Play/Pause, Cue (to start) and two hot cues per deck.
- **Web MIDI** integration mapping every control on the Fri3d DJ addon, with
  **LED feedback** sent back to the controller and a console debug log of all
  MIDI traffic.

## Requirements

- A Chromium-based browser (Web MIDI is required for the controller; Web Audio
  for playback). The app must run over `localhost` or HTTPS, Web MIDI needs a
  secure context.
- A Fri3d DJ addon is optional: the UI is fully usable with a mouse.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
```

Then:

1. Open the app and click **Connect controller** to grant Web MIDI access
   (skip this if you only want to use the mouse).
2. Click **Load track** on each deck to choose an audio file.
3. Hit **Play**, ride the EQ and faders, and work the crossfader.

### Other scripts

```bash
npm run build    # type-check and build for production
npm run preview  # preview the production build
npm run lint     # run ESLint
```
