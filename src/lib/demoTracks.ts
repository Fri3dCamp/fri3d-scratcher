// Two example dance tracks used by the onboarding tutorial, hosted on a
// public Cloudflare R2 bucket behind a custom domain (full CDN caching + CORS).
export interface DemoTrack {
  /** Display/file name used when loading the track into a deck. */
  name: string;
  url: string;
  /** Attribution shown in the tutorial. */
  title: string;
  artist: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
}

const CDN = "https://demo.sebastiaanjansen.be";

export const DEMO_TRACKS: [DemoTrack, DemoTrack] = [
  {
    name: "Melatronic - Dancing Synth.mp3",
    url: `${CDN}/melatronic-dancing-synth.mp3`,
    title: "Dancing Synth",
    artist: "Melatronic",
    license: "CC BY-NC-ND 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    sourceUrl: "https://freemusicarchive.org/music/melatronic-1/the-dancefloor-is-calling/dancing-synth/",
  },
  {
    name: "1000 Handz - Dreamz.mp3",
    url: `${CDN}/1000-handz-dreamz.mp3`,
    title: "Dreamz",
    artist: "1000 Handz",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-dancehouse-instrumentals/dreamz-1/",
  },
];
