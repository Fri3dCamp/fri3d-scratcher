import { useEffect, useLayoutEffect, useState } from "react";
import type { Lang } from "../lib/tutorialText";
import { TUTORIAL_TEXT } from "../lib/tutorialText";
import { DEMO_TRACKS } from "../lib/demoTracks";

interface TutorialProps {
  open: boolean;
  onClose: () => void;
  /** Loads the two example songs into the decks. Resolves when both are loaded. */
  onLoadDemo: () => Promise<void>;
}

const LANG_KEY = "fri3d-scratcher-lang";
const SPOT_PADDING = 10;

function storedLang(): Lang | null {
  const value = localStorage.getItem(LANG_KEY);
  return value === "en" || value === "nl" ? value : null;
}

type DemoState = "idle" | "loading" | "done" | "error";

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Tracks the on-screen rectangle of the element the current step points at. */
function useSpotlight(selector: string | undefined, active: boolean): SpotRect | null {
  const [rect, setRect] = useState<SpotRect | null>(null);

  useLayoutEffect(() => {
    if (!active || !selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    window.addEventListener("resize", update);
    // Capture-phase listener also fires while scrollIntoView animates.
    window.addEventListener("scroll", update, true);
    return () => {
      setRect(null);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [selector, active]);

  return rect;
}

export function Tutorial({ open, onClose, onLoadDemo }: TutorialProps) {
  const [lang, setLang] = useState<Lang | null>(storedLang);
  const [step, setStep] = useState(0);
  const [demoState, setDemoState] = useState<DemoState>("idle");

  // Reset to the first page each time the tutorial opens.
  useEffect(() => {
    if (open) {
      setStep(0);
      setDemoState("idle");
      setLang(storedLang());
    }
  }, [open]);

  const steps = lang ? TUTORIAL_TEXT[lang].steps : [];
  const current = steps[step] as (typeof steps)[number] | undefined;
  const spot = useSpotlight(current?.target, open && lang != null);

  if (!open) return null;

  const pickLang = (value: Lang) => {
    localStorage.setItem(LANG_KEY, value);
    setLang(value);
    setStep(0);
  };

  // --- language picker ------------------------------------------------
  if (lang == null || current == null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <Card>
          <div className="flex flex-col items-center gap-6 text-center">
            <span className="text-6xl" aria-hidden>
              🌍
            </span>
            <h2 className="font-display text-2xl font-bold uppercase">
              Choose your language
              <span className="mt-1 block text-base font-semibold text-fri3d-darkgrey">Kies je taal</span>
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => pickLang("en")} className={bigBtn("bg-fri3d-purple text-white")}>
                🇬🇧 English
              </button>
              <button type="button" onClick={() => pickLang("nl")} className={bigBtn("bg-fri3d-mint text-black")}>
                🇳🇱 Nederlands
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const t = TUTORIAL_TEXT[lang];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  // The "get some music" step offers the demo songs.
  const isMusicStep = step === 1;

  const loadDemo = async () => {
    setDemoState("loading");
    try {
      await onLoadDemo();
      setDemoState("done");
    } catch {
      setDemoState("error");
    }
  };

  // Put the card in the half of the screen the spotlight is NOT in.
  const spotInTopHalf = spot != null && spot.top + spot.height / 2 < window.innerHeight / 2;
  const cardPlacement = spot == null ? "items-center" : spotInTopHalf ? "items-end" : "items-start";

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Backdrop — with a spotlight hole when the step points at an element */}
      {spot ? (
        <>
          {/* Visual ring + darkening (box-shadow); never blocks the pointer */}
          <div
            className="pointer-events-none fixed rounded-xl border-4 border-fri3d-orange transition-all duration-500 ease-out"
            style={{
              top: spot.top - SPOT_PADDING,
              left: spot.left - SPOT_PADDING,
              width: spot.width + SPOT_PADDING * 2,
              height: spot.height + SPOT_PADDING * 2,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.7)",
            }}
          >
            {/* Pulsing ring to draw the eye */}
            <div className="absolute -inset-1.5 animate-pulse rounded-xl border-4 border-fri3d-orange" />
          </div>
          {/* Click blockers around the hole — the highlighted element stays interactive */}
          <div className="pointer-events-auto fixed inset-x-0 top-0" style={{ height: Math.max(0, spot.top - SPOT_PADDING) }} />
          <div className="pointer-events-auto fixed inset-x-0 bottom-0" style={{ top: spot.top + spot.height + SPOT_PADDING }} />
          <div
            className="pointer-events-auto fixed left-0"
            style={{
              top: spot.top - SPOT_PADDING,
              height: spot.height + SPOT_PADDING * 2,
              width: Math.max(0, spot.left - SPOT_PADDING),
            }}
          />
          <div
            className="pointer-events-auto fixed right-0"
            style={{
              top: spot.top - SPOT_PADDING,
              height: spot.height + SPOT_PADDING * 2,
              left: spot.left + spot.width + SPOT_PADDING,
            }}
          />
        </>
      ) : (
        <div className="pointer-events-auto fixed inset-0 bg-black/70" />
      )}

      {/* Card, placed away from the spotlight */}
      <div className={`pointer-events-none fixed inset-0 flex justify-center p-4 ${cardPlacement}`}>
        <Card>
          <div className="flex flex-col gap-4">
            {/* Language switch + skip */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                <LangChip active={lang === "en"} onClick={() => pickLang("en")} label="EN" />
                <LangChip active={lang === "nl"} onClick={() => pickLang("nl")} label="NL" />
              </div>
              <button
                type="button"
                onClick={onClose}
                className="font-display text-xs font-bold uppercase text-fri3d-darkgrey underline"
              >
                {t.skip}
              </button>
            </div>

            {/* Step content — keyed on the step so it pops in on every change */}
            <div key={step} className="animate-tutorial-pop flex flex-col items-center gap-3 text-center">
              <span className="text-5xl" aria-hidden>
                {current.emoji}
              </span>
              <h2 className="font-display text-xl font-bold uppercase">{current.title}</h2>
              <p className="max-w-md text-sm leading-relaxed">{current.body}</p>

              {isMusicStep && (
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={loadDemo}
                    disabled={demoState === "loading" || demoState === "done"}
                    className={bigBtn("bg-fri3d-orange text-black disabled:opacity-60")}
                  >
                    {demoState === "loading" ? t.loadingDemo : demoState === "done" ? t.demoLoaded : `🎶 ${t.loadDemo}`}
                  </button>
                  {demoState === "error" && (
                    <p className="max-w-sm text-sm font-semibold text-fri3d-red">{t.demoFailed}</p>
                  )}
                  {/* Attribution for the example tracks (CC licenses) */}
                  <p className="max-w-sm text-[0.65rem] leading-relaxed text-fri3d-darkgrey">
                    {DEMO_TRACKS.map((track, i) => (
                      <span key={track.title}>
                        {i > 0 && " · "}
                        <a href={track.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                          “{track.title}”
                        </a>{" "}
                        by {track.artist} (
                        <a href={track.licenseUrl} target="_blank" rel="noreferrer" className="underline">
                          {track.license}
                        </a>
                        )
                      </span>
                    ))}
                    {" · Free Music Archive"}
                  </p>
                </div>
              )}
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-2">
              {steps.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  aria-label={`${i + 1}`}
                  onClick={() => setStep(i)}
                  className={`h-3 w-3 rounded-full border-2 border-black ${i === step ? "bg-fri3d-purple" : "bg-white"}`}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep((v) => v - 1)}
                disabled={isFirst}
                className={navBtn("bg-white text-black")}
              >
                ← {t.back}
              </button>
              {isLast ? (
                <button type="button" onClick={onClose} className={navBtn("bg-fri3d-mint text-black")}>
                  {t.finish} 🚀
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep((v) => v + 1)}
                  className={navBtn("bg-fri3d-purple text-white")}
                >
                  {t.next} →
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto w-full max-w-lg rounded-lg border-8 border-black bg-white p-5 shadow-hard-sm">
      {children}
    </div>
  );
}

function bigBtn(extra: string): string {
  return `rounded-md border-4 border-black px-5 py-3 font-display text-base font-bold uppercase shadow-hard-sm transition-transform enabled:active:translate-x-1 enabled:active:translate-y-1 enabled:active:shadow-none ${extra}`;
}

function navBtn(extra: string): string {
  return `rounded-md border-4 border-black px-4 py-2 font-display text-sm font-bold uppercase shadow-hard-sm transition-transform enabled:active:translate-x-1 enabled:active:translate-y-1 enabled:active:shadow-none disabled:opacity-40 ${extra}`;
}

function LangChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border-2 border-black px-2 py-1 font-display text-xs font-bold ${
        active ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      {label}
    </button>
  );
}
