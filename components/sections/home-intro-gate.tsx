"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const INTRO_VIDEO_SRC = "/Welcoming.mp4";
const INTRO_FADE_MS = 800;
const INTRO_MAX_MS = 9500;
const INTRO_SESSION_KEY = "ftt-home-intro-seen";

type IntroPhase = "checking" | "playing" | "revealing" | "done";

const HomeIntroReadyContext = createContext(true);

const hasSeenIntroThisSession = () => {
  try {
    return window.sessionStorage.getItem(INTRO_SESSION_KEY) === "true";
  } catch {
    return false;
  }
};

const markIntroSeenThisSession = () => {
  try {
    window.sessionStorage.setItem(INTRO_SESSION_KEY, "true");
  } catch {
    // If storage is unavailable, keep the intro functional for this visit.
  }
};

export function useHomeIntroReady() {
  return useContext(HomeIntroReadyContext);
}

interface HomeIntroGateProps {
  children: ReactNode;
}

export function HomeIntroGate({ children }: HomeIntroGateProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<IntroPhase>("checking");

  const shouldShowOverlay = phase === "playing" || phase === "revealing";
  const isIntroReady = phase === "done";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const prefersCompactViewport = window.matchMedia(
        "(max-width: 767px)",
      ).matches;
      const hasSeenIntro = hasSeenIntroThisSession();

      if (prefersReducedMotion || prefersCompactViewport || hasSeenIntro) {
        setPhase("done");
        return;
      }

      markIntroSeenThisSession();
      setPhase("playing");
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;

    const reveal = () => {
      setPhase((current) => (current === "done" ? current : "revealing"));
    };

    const maxTimer = window.setTimeout(reveal, INTRO_MAX_MS);
    const cleanupTimer = window.setTimeout(() => {
      setPhase((current) => (current === "revealing" ? "done" : current));
    }, INTRO_MAX_MS + INTRO_FADE_MS);

    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.play().catch(reveal);
    }

    return () => {
      window.clearTimeout(maxTimer);
      window.clearTimeout(cleanupTimer);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "revealing") return;

    const timer = window.setTimeout(() => {
      setPhase("done");
    }, INTRO_FADE_MS);

    return () => window.clearTimeout(timer);
  }, [phase]);

  const reveal = () => {
    setPhase((current) => (current === "done" ? current : "revealing"));
  };

  return (
    <HomeIntroReadyContext.Provider value={isIntroReady}>
      <div
        className="transition-opacity duration-700 ease-out"
      >
        {children}
      </div>

      {shouldShowOverlay && (
        <div
          className={cn(
            "fixed inset-0 z-100 flex items-center justify-center overflow-hidden bg-[#FDF7F1] transform-[translateZ(0)] transition-opacity duration-700 ease-out",
            phase === "revealing" && "pointer-events-none opacity-0",
          )}
        >
          <video
            ref={videoRef}
            aria-hidden="true"
            className="h-full w-full object-cover"
            src={INTRO_VIDEO_SRC}
            muted
            autoPlay
            playsInline
            preload="metadata"
            onEnded={reveal}
            onError={reveal}
          />
          <button
            type="button"
            onClick={reveal}
            aria-label="Skip intro video"
            className="fixed bottom-6 right-6 z-10 inline-flex items-center gap-2 rounded-full border border-[#B39152]/50 bg-[#601D1C]/70 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#FDF7F1] backdrop-blur-md transition duration-300 hover:border-[#B39152] hover:bg-[#601D1C]/90 hover:text-[#B39152] sm:bottom-8 sm:right-8"
          >
            Skip Intro
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M5 5v14l8-7-8-7Zm9 0v14h2V5h-2Z" />
            </svg>
          </button>
        </div>
      )}
    </HomeIntroReadyContext.Provider>
  );
}
