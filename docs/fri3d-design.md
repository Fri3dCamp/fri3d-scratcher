I couldn’t fetch `fri3d.be` directly because it is blocked by robots.txt, so I used the public `Fri3dCamp/fri3dweb` source repository that powers the site. The repo README says the site is a Hugo static site, and the SCSS lives in `assets/sass`. ([GitHub][1])

## Fri3d visual style to reuse

### Core colors

The main palette is defined in `params.scss`: ([GitHub][2])

```css id="z78nct"
:root {
  --fri3d-purple: rgb(136, 53, 201);
  --fri3d-orange: rgb(255, 173, 100);
  --fri3d-purple-light: rgb(192, 133, 255);
  --fri3d-mint: rgb(60, 232, 179);
  --fri3d-mint-dark: rgb(47, 173, 131);
  --fri3d-red: rgb(255, 62, 62);
  --fri3d-darkgrey: rgb(45, 45, 45);

  --fri3d-black: #000;
  --fri3d-white: #fff;

  --fri3d-radius: 8px;
  --fri3d-spacer: 1.2rem;
}
```

Use them like this for your DJ app:

| Purpose                                 | Color              |
| --------------------------------------- | ------------------ |
| Primary accent / links                  | purple             |
| Secondary warm panels/nav               | orange             |
| Active buttons / success / “go” state   | mint               |
| Warning / ticker / recording/live state | red                |
| Footer / logo panels / hard outlines    | black              |
| Body text                               | dark grey or black |

### Typography

The site uses **Open Sans** for body text and **Montserrat** for navigation, headings, and strong display UI. The SCSS includes local `@font-face` definitions for Open Sans regular, italic, bold, bold italic, and Montserrat light, regular, and semibold. ([GitHub][3])

For a web app, the practical version is:

```css id="y8x14y"
body {
  font-family: "Open Sans", system-ui, sans-serif;
  font-size: 1.6rem;
}

h1, h2, h3, .nav, .button, .control-label {
  font-family: "Montserrat", system-ui, sans-serif;
}
```

The site sets `html { font-size: 62.5%; }`, so `1rem` behaves like roughly `10px`, and the body font size is `1.6rem`. ([GitHub][4])

### Layout feel

The site uses a **12-column CSS grid** mixin:

```scss
display: grid;
grid-template-columns: repeat(12, 8.333%);
```

That grid is used for headers, nav, page titles, and main content. ([GitHub][4])

For the DJ app, use a 12-column dashboard:

```css id="kemhox"
.dj-app {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: white;
  color: black;
}

.dj-main {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--fri3d-spacer);
  padding: calc(var(--fri3d-spacer) * 2);
}

.deck {
  grid-column: span 5;
}

.mixer {
  grid-column: span 2;
}

@media (max-width: 860px) {
  .deck,
  .mixer {
    grid-column: 1 / -1;
  }
}
```

The source breakpoints are roughly `1200`, `1024`, `860`, `800`, `620`, `460`, and `360px`, with primary nav switching at `620px`. ([GitHub][2])

## Components to copy into your app

### Fri3d-style buttons

The strongest Fri3d button look is a flat colored button with a thick black border and a hard black offset shadow. The site uses this for CTAs and hero buttons. ([GitHub][4])

```css id="qh8pne"
.fri3d-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  font-family: "Montserrat", system-ui, sans-serif;
  font-weight: 700;
  text-decoration: none;

  background: var(--fri3d-mint);
  color: black;
  border: 5px solid black;
  box-shadow: 8px 8px 0 black;

  padding: 1rem 1.4rem;
  cursor: pointer;
}

.fri3d-button--purple {
  background: var(--fri3d-purple);
  color: white;
}

.fri3d-button--orange {
  background: var(--fri3d-orange);
  color: black;
}

.fri3d-button:active {
  transform: translate(4px, 4px);
  box-shadow: 4px 4px 0 black;
}
```

### Panels / callouts

The site uses bordered callout blocks with `8px solid` purple borders and centered content. ([GitHub][4])

```css id="oha6wz"
.fri3d-panel {
  background: white;
  border: 8px solid var(--fri3d-purple);
  padding: calc(var(--fri3d-spacer) * 2);
  position: relative;
}

.fri3d-panel--orange {
  border: none;
  background: var(--fri3d-orange);
}

.fri3d-panel__title {
  font-family: "Montserrat", system-ui, sans-serif;
  font-size: clamp(2rem, 3vw, 3rem);
  font-weight: 700;
  text-align: center;
}
```

### Navigation / top bar

The website combines a black top strip, red ticker, orange primary nav, and black/white logo blocks. ([GitHub][4])

For your DJ app:

```css id="vhuixm"
.dj-topbar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  background: black;
  color: white;
}

.dj-logo {
  background: black;
  color: white;
  font-family: "Montserrat", system-ui, sans-serif;
  font-weight: 700;
  padding: 1rem 1.4rem;
}

.dj-status {
  background: var(--fri3d-red);
  color: white;
  padding: 1rem;
  font-size: clamp(1.2rem, 1vw + 0.8rem, 2rem);
}

.dj-nav {
  background: var(--fri3d-orange);
  border-top: 4px solid white;
  border-bottom: 1.2rem solid white;
  padding: 1rem;
}
```

### Forms / MIDI connect controls

Inputs on the site are rounded with black borders; focused inputs switch to a thicker purple border. Buttons use mint with a darker bottom edge. ([GitHub][5])

```css id="nwb1c3"
input,
select,
textarea {
  box-sizing: border-box;
  border: 1px solid black;
  border-radius: var(--fri3d-radius);
  padding: 1.2rem;
  font: inherit;
}

input:focus,
select:focus,
textarea:focus {
  outline: none;
  border: 3px solid var(--fri3d-purple);
}

.fri3d-soft-button {
  background: var(--fri3d-mint);
  border: none;
  border-bottom: 4px solid var(--fri3d-mint-dark);
  border-radius: var(--fri3d-radius);
  padding: 1rem;
  font-weight: 700;
}
```

## DJ-specific styling suggestion

Map the Fri3d palette onto your DJ controls like this:

```css id="zf02pe"
.deck--left {
  --deck-accent: var(--fri3d-purple);
}

.deck--right {
  --deck-accent: var(--fri3d-mint);
}

.deck {
  border: 8px solid var(--deck-accent);
  padding: 1.2rem;
  background: white;
}

.knob,
.fader,
.pad {
  border: 4px solid black;
  background: var(--fri3d-orange);
  box-shadow: 6px 6px 0 black;
}

.pad.is-active {
  background: var(--fri3d-mint);
}

.pad.is-recording,
.pad.is-hot {
  background: var(--fri3d-red);
  color: white;
}

.crossfader {
  border: 5px solid black;
  background: var(--fri3d-purple-light);
}
```

## Drop-in starter CSS

```css id="wkfeqe"
:root {
  --fri3d-purple: rgb(136, 53, 201);
  --fri3d-orange: rgb(255, 173, 100);
  --fri3d-purple-light: rgb(192, 133, 255);
  --fri3d-mint: rgb(60, 232, 179);
  --fri3d-mint-dark: rgb(47, 173, 131);
  --fri3d-red: rgb(255, 62, 62);
  --fri3d-darkgrey: rgb(45, 45, 45);
  --fri3d-radius: 8px;
  --fri3d-spacer: 1.2rem;
}

html {
  font-size: 62.5%;
}

body {
  margin: 0;
  font-family: "Open Sans", system-ui, sans-serif;
  font-size: 1.6rem;
  color: black;
  background: white;
}

a {
  color: var(--fri3d-purple);
  text-decoration: none;
}

.dj-app {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.dj-topbar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  background: black;
  color: white;
}

.dj-logo {
  font-family: "Montserrat", system-ui, sans-serif;
  font-weight: 700;
  padding: 1rem 1.4rem;
}

.dj-status {
  background: var(--fri3d-red);
  color: white;
  padding: 1rem 1.4rem;
}

.dj-main {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: calc(var(--fri3d-spacer) * 2);
  padding: calc(var(--fri3d-spacer) * 2);
}

.deck {
  grid-column: span 5;
  border: 8px solid var(--deck-accent, var(--fri3d-purple));
  padding: calc(var(--fri3d-spacer) * 2);
  background: white;
}

.deck--left {
  --deck-accent: var(--fri3d-purple);
}

.deck--right {
  --deck-accent: var(--fri3d-mint);
}

.mixer {
  grid-column: span 2;
  border: 8px solid black;
  padding: var(--fri3d-spacer);
  background: var(--fri3d-orange);
}

.deck__title,
.mixer__title,
.control-label {
  font-family: "Montserrat", system-ui, sans-serif;
}

.deck__title,
.mixer__title {
  margin-top: 0;
  text-align: center;
  font-size: clamp(2rem, 3vw, 3rem);
}

.pad,
.fri3d-button {
  font-family: "Montserrat", system-ui, sans-serif;
  font-weight: 700;
  background: var(--fri3d-orange);
  color: black;
  border: 5px solid black;
  box-shadow: 8px 8px 0 black;
  padding: 1rem;
  cursor: pointer;
}

.pad.is-active,
.fri3d-button--active {
  background: var(--fri3d-mint);
}

.pad.is-hot {
  background: var(--fri3d-red);
  color: white;
}

.pad:active,
.fri3d-button:active {
  transform: translate(4px, 4px);
  box-shadow: 4px 4px 0 black;
}

input,
select {
  box-sizing: border-box;
  border: 1px solid black;
  border-radius: var(--fri3d-radius);
  padding: 1.2rem;
  font: inherit;
}

input:focus,
select:focus {
  outline: none;
  border: 3px solid var(--fri3d-purple);
}

.dj-footer {
  background: black;
  color: white;
  padding: calc(var(--fri3d-spacer) * 2);
}

@media (max-width: 860px) {
  .deck,
  .mixer {
    grid-column: 1 / -1;
  }
}
```

The overall style to aim for is: **playful hacker-camp branding, bold black outlines, hard offset shadows, high-contrast blocks, Montserrat headings, Open Sans body text, purple/orange/mint as the main trio, and red only for urgent/live/status moments.**

[1]: https://github.com/Fri3dCamp/fri3dweb "GitHub - Fri3dCamp/fri3dweb: Fri3d website · GitHub"
[2]: https://raw.githubusercontent.com/Fri3dCamp/fri3dweb/master/assets/sass/params.scss "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/Fri3dCamp/fri3dweb/master/assets/sass/font_opensans.scss "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/Fri3dCamp/fri3dweb/master/assets/sass/main.scss "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/Fri3dCamp/fri3dweb/master/assets/sass/form.scss "raw.githubusercontent.com"
