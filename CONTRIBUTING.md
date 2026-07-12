# Contributing to Fri3d Scratcher

Thanks for your interest in contributing to **Fri3d Scratcher**!

Fri3d Scratcher is a browser-based, two-deck DJ mixer built with React, TypeScript, Vite, Tailwind CSS, the Web Audio API, and Web MIDI. It can be controlled with a mouse or with the Fri3d DJ addon.

Contributions of all sizes are welcome, including bug fixes, documentation improvements, UI refinements, browser compatibility fixes, MIDI improvements, and new audio features.

## Before you start

For small fixes, feel free to open a pull request directly.

For larger changes—especially changes to the audio engine, MIDI mappings, user interface, recording, or offline behaviour—please open an issue first. This gives maintainers and contributors a chance to agree on the approach before significant work is done.

When working on an existing issue, leave a comment so that other contributors know someone is working on it.

## Development setup

### Prerequisites

You will need:

* [Node.js](https://nodejs.org/) 22 or a compatible recent version
* npm
* A Chromium-based browser for testing Web MIDI
* Optionally, a Fri3d DJ addon for hardware testing

The application must run from `localhost` or HTTPS for Web MIDI to work.

### Install and run

Fork the repository, clone your fork, and install the dependencies:

```bash
git clone https://github.com/YOUR-USERNAME/fri3d-scratcher.git
cd fri3d-scratcher
npm ci
```

Start the development server:

```bash
npm run dev
```

Open the URL printed by Vite, normally:

```text
http://localhost:5173
```

You can use the complete interface with a mouse. Hardware is not required for most contributions.

## Useful commands

```bash
npm run dev
```

Starts the Vite development server.

```bash
npm run lint
```

Runs ESLint across the project.

```bash
npm run build
```

Type-checks the project and creates a production build.

```bash
npm run preview
```

Serves the production build locally. Use this when checking production-only or PWA behaviour.

## Project structure

The most relevant parts of the repository are:

```text
src/
├── components/       React interface components
├── lib/
│   ├── audio.ts      Web Audio engine, decks, EQ, scratching and recording
│   ├── midi.ts       Fri3d DJ addon MIDI mappings and LED output
│   ├── useMixer.ts   React state and coordination for the mixer
│   ├── demoTracks.ts Demo-track definitions
│   └── *-processor.js
│                      AudioWorklet processors
├── App.tsx           Main application component
└── index.css         Global styles

public/               Static assets
vite.config.ts        Vite and PWA configuration
.github/workflows/    GitHub Pages deployment
```

## Development guidelines

### Keep changes focused

Prefer small pull requests that solve one problem. Avoid unrelated refactoring, dependency updates, or formatting changes in the same pull request.

Do not commit:

* `node_modules/`
* The generated `dist/` directory
* Personal audio files
* Browser recordings
* Editor-specific files not already covered by `.gitignore`
* Credentials, tokens, or private information

### TypeScript and React

* Use TypeScript for new application code.
* Prefer explicit types at module boundaries and for shared data structures.
* Reuse the existing components and mixer APIs before introducing new abstractions.
* Keep browser APIs behind clear interfaces where practical.
* Clean up event listeners, animation frames, object URLs, AudioNodes, and other resources when components or engines are destroyed.
* Follow the style of the file you are editing. There is currently no automatic formatter, so avoid reformatting unrelated code.

### Web Audio changes

Audio changes can easily introduce clicks, distortion, timing errors, excessive memory use, or regressions that only appear after prolonged playback.

When changing the audio engine:

* Test both decks independently and simultaneously.
* Check play, pause, seek, cue, hot cues, tempo, scratching, EQ, volume, and crossfading as applicable.
* Test with short and long tracks.
* Test mono and stereo files where possible.
* Avoid doing expensive work on the real-time audio thread.
* Clean up disconnected nodes and transferred buffers.
* Check the browser console for AudioWorklet errors.
* Describe any intentional change in sound or timing in the pull request.

Do not commit copyrighted music or other audio unless the project has clear permission to redistribute it.

### Web MIDI changes

MIDI mappings for the Fri3d DJ addon live in `src/lib/midi.ts`.

When changing MIDI behaviour:

* Preserve MIDI channel and Control Change handling unless the controller firmware has changed.
* Keep input mappings and LED feedback in sync.
* Account for duplicate or repeated hardware events.
* Test controller reconnects when possible.
* Check the browser console for incoming and outgoing MIDI messages.
* Document firmware assumptions or required firmware changes.

Access to the physical controller is helpful but not required to contribute. If you cannot test with hardware, state that clearly in the pull request.

### UI changes

When changing the interface:

* Test with both decks empty and with tracks loaded.
* Test mouse and pointer interactions.
* Make controls usable without unusually precise pointer movement.
* Preserve visible focus states and meaningful labels.
* Check common laptop and tablet-sized viewports.
* Include screenshots or a short recording for visible changes.

The application is primarily designed for landscape use, but changes should not unnecessarily break narrower screens.

### PWA and offline changes

The application uses a service worker and caches its application shell. Some demo audio may also be cached at runtime.

For PWA-related changes, test the production build rather than relying only on the development server:

```bash
npm run build
npm run preview
```

Check:

* First load
* Reload after installation
* Service-worker updates
* Cached assets
* Offline startup
* Behaviour when demo audio is unavailable
* Removal or renaming of previously cached assets

Be careful when changing cache names or caching rules, as existing users may have an older service worker installed.

### Dependencies

Avoid adding a dependency for functionality that can be implemented clearly with existing browser APIs or the current dependency set.

When a new dependency is justified:

* Explain why it is needed in the pull request.
* Prefer actively maintained, narrowly scoped packages.
* Review its licence and browser compatibility.
* Run `npm install` so that both `package.json` and `package-lock.json` are updated.
* Do not manually edit `package-lock.json`.

## Testing your contribution

There is currently no automated test command, so every pull request must pass the available static checks and include appropriate manual testing.

Run:

```bash
npm run lint
npm run build
```

Then manually test the areas affected by your change.

A general smoke test includes:

1. Start the application in a Chromium-based browser.
2. Load a track into each deck.
3. Play and pause both decks.
4. Seek using the waveform.
5. Use cue and hot-cue controls.
6. Move each EQ control and volume fader.
7. Move the crossfader fully left, through the centre, and fully right.
8. Scratch both decks with the mouse.
9. Check that track metadata, artwork, waveform, duration, and BPM behave correctly.
10. Check the browser console for errors.

When relevant, also test:

* Recording and cancelling the save dialog
* Demo-track loading
* Offline/PWA behaviour
* MIDI controls and LED feedback
* Controller disconnect and reconnect
* Browsers without Web MIDI or the File System Access API

Include a concise testing summary in your pull request. For example:

```text
Tested:
- npm run lint
- npm run build
- Chromium 138 on Linux
- Mouse controls on both decks
- MIDI knobs, faders, pads and LEDs with the Fri3d DJ addon

Not tested:
- Recording on Windows
```

## Reporting bugs

Before opening an issue, check whether a similar issue already exists.

A useful bug report includes:

* A clear description of the problem
* Steps to reproduce it
* Expected behaviour
* Actual behaviour
* Browser name and version
* Operating system
* Whether a Fri3d DJ addon was connected
* The audio file format involved, where relevant
* Console errors or MIDI debug output
* Screenshots or a short screen recording, where useful

Do not upload copyrighted audio to demonstrate a bug. A generated tone, public-domain sample, or description of the file’s format is usually sufficient.

For hardware-related issues, also include:

* Controller firmware version, when known
* The device name shown by the browser
* Which physical control was used
* Relevant Control Change numbers and values from the console

## Making a pull request

1. Create a branch from the latest `main`:

   ```bash
   git switch main
   git pull --ff-only
   git switch -c fix/short-description
   ```

2. Make focused commits with clear messages.

3. Run the lint and build commands.

4. Push the branch to your fork.

5. Open a pull request against `Fri3dCamp/fri3d-scratcher:main`.

Your pull request should explain:

* What changed
* Why the change is needed
* How it was tested
* Any browser or hardware limitations
* Any user-visible or compatibility impact
* Related issues

Add screenshots or a short recording for visible interface changes.

Maintainers may request changes. Review is a collaborative process, so questions and discussion are welcome.

## Commit messages

There is no required commit-message convention. Use a brief, imperative description that explains the change:

```text
Fix duplicate MIDI pad events
Improve waveform seeking on touch screens
Document offline demo-track behaviour
```

Avoid vague messages such as `fix`, `changes`, or `updates`.

## Community expectations

Be respectful, patient, and constructive.

Fri3d Camp welcomes people with different experience levels. Explain technical decisions without dismissing questions, and assume that contributors are participating in good faith.

Thank you for helping improve Fri3d Scratcher!
