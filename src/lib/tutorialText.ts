export type Lang = "en" | "nl";

export interface TutorialStep {
  emoji: string;
  title: string;
  body: string;
  /** CSS selector of the element to spotlight on the page, if any. */
  target?: string;
}

export interface TutorialText {
  chooseLanguage: string;
  english: string;
  dutch: string;
  next: string;
  back: string;
  finish: string;
  skip: string;
  loadDemo: string;
  loadingDemo: string;
  demoLoaded: string;
  demoFailed: string;
  steps: TutorialStep[];
}

export const TUTORIAL_TEXT: Record<Lang, TutorialText> = {
  en: {
    chooseLanguage: "Choose your language",
    english: "English",
    dutch: "Nederlands",
    next: "Next",
    back: "Back",
    finish: "Let's go!",
    skip: "Skip",
    loadDemo: "Load 2 example songs",
    loadingDemo: "Loading songs…",
    demoLoaded: "Songs loaded! 🎉",
    demoFailed: "Couldn't load the example songs. You can pick your own music instead!",
    steps: [
      {
        emoji: "🎧",
        title: "You are the DJ!",
        body: "Welcome! With this app you can play two songs at the same time and mix them together, just like a real DJ. Let's learn how!",
      },
      {
        emoji: "🎵",
        title: "Get some music",
        body: "You have two music players: Deck A (left) and Deck B (right). Press the LOAD TRACK button on a deck to pick a song from your computer. Or press the button below to load two example dance songs!",
        target: '[data-tutorial="load-left"]',
      },
      {
        emoji: "▶️",
        title: "Press play",
        body: "Press the big PLAY button on a deck to start the music. Press it again to pause. Easy!",
        target: '[data-tutorial="play-left"]',
      },
      {
        emoji: "↔️",
        title: "The crossfader",
        body: "The slider in the middle is the crossfader. Slide it to the left to hear Deck A, slide it to the right to hear Deck B. Slide it slowly to mix the two songs together!",
        target: '[data-tutorial="crossfader"]',
      },
      {
        emoji: "🎛️",
        title: "Twist the knobs",
        body: "Every deck has knobs for HIGH, MID and LOW sounds. Turn LOW down to make the bass quiet, or turn HIGH up for bright sparkly sounds. Try it and listen to what changes!",
        target: '[data-tutorial="eq-left"]',
      },
      {
        emoji: "💿",
        title: "Scratch!",
        body: "Grab the big spinning wheel with your mouse and move it back and forth. That's scratching — it sounds just like a real vinyl record!",
        target: '[data-tutorial="jog-left"]',
      },
      {
        emoji: "🪄",
        title: "Magic SYNC button",
        body: "Songs have a speed called BPM (beats per minute). Press SYNC and the deck changes its speed to match the other song, so the beats dance together perfectly.",
        target: '[data-tutorial="sync-left"]',
      },
      {
        emoji: "🎚️",
        title: "The DJ addon",
        body: "Do you have the Fri3d DJ addon? It's a real controller with knobs, faders and spinning platters! Plug it into your computer with USB and press CONNECT CONTROLLER at the top. Everything you turn on the controller moves on screen too. No addon? No problem — the mouse works just as well.",
        target: '[data-tutorial="connect"]',
      },
      {
        emoji: "🌟",
        title: "You're ready!",
        body: "That's it! Load two songs, press play on both, and use the crossfader to mix. Have fun — you can open this tutorial again with the ? button at the top.",
      },
    ],
  },
  nl: {
    chooseLanguage: "Kies je taal",
    english: "English",
    dutch: "Nederlands",
    next: "Volgende",
    back: "Terug",
    finish: "Aan de slag!",
    skip: "Overslaan",
    loadDemo: "Laad 2 voorbeeldliedjes",
    loadingDemo: "Liedjes laden…",
    demoLoaded: "Liedjes geladen! 🎉",
    demoFailed: "De voorbeeldliedjes konden niet geladen worden. Kies gerust je eigen muziek!",
    steps: [
      {
        emoji: "🎧",
        title: "Jij bent de DJ!",
        body: "Welkom! Met deze app kun je twee liedjes tegelijk afspelen en ze mixen, net als een echte DJ. Kom, we leren hoe het werkt!",
      },
      {
        emoji: "🎵",
        title: "Zoek muziek",
        body: "Je hebt twee muziekspelers: Deck A (links) en Deck B (rechts). Druk op de knop LOAD TRACK om een liedje van je computer te kiezen. Of druk op de knop hieronder om twee voorbeeld-dansliedjes te laden!",
        target: '[data-tutorial="load-left"]',
      },
      {
        emoji: "▶️",
        title: "Druk op play",
        body: "Druk op de grote PLAY-knop om de muziek te starten. Druk nog een keer om te pauzeren. Makkelijk!",
        target: '[data-tutorial="play-left"]',
      },
      {
        emoji: "↔️",
        title: "De crossfader",
        body: "De schuif in het midden is de crossfader. Schuif naar links om Deck A te horen, naar rechts om Deck B te horen. Schuif langzaam om de twee liedjes samen te mixen!",
        target: '[data-tutorial="crossfader"]',
      },
      {
        emoji: "🎛️",
        title: "Draai aan de knoppen",
        body: "Elk deck heeft knoppen voor HIGH (hoge), MID (midden) en LOW (lage) tonen. Draai LOW omlaag om de bas stiller te maken, of HIGH omhoog voor heldere klanken. Probeer maar en luister wat er verandert!",
        target: '[data-tutorial="eq-left"]',
      },
      {
        emoji: "💿",
        title: "Scratchen!",
        body: "Pak het grote draaiende wiel met je muis en beweeg het heen en weer. Dat is scratchen — het klinkt net als een echte platenspeler!",
        target: '[data-tutorial="jog-left"]',
      },
      {
        emoji: "🪄",
        title: "Magische SYNC-knop",
        body: "Liedjes hebben een snelheid die BPM heet (beats per minuut). Druk op SYNC en het deck past zijn snelheid aan zodat de beats van de twee liedjes perfect samen dansen.",
        target: '[data-tutorial="sync-left"]',
      },
      {
        emoji: "🎚️",
        title: "De DJ-addon",
        body: "Heb jij de Fri3d DJ-addon? Dat is een echte controller met knoppen, schuiven en draaiwielen! Steek hem met USB in je computer en druk bovenaan op CONNECT CONTROLLER. Alles wat je draait op de controller beweegt ook op het scherm. Geen addon? Geen probleem — met de muis werkt het net zo goed.",
        target: '[data-tutorial="connect"]',
      },
      {
        emoji: "🌟",
        title: "Je bent er klaar voor!",
        body: "Dat is alles! Laad twee liedjes, druk op play bij allebei en mix met de crossfader. Veel plezier — je kunt deze uitleg altijd opnieuw openen met de ?-knop bovenaan.",
      },
    ],
  },
};
