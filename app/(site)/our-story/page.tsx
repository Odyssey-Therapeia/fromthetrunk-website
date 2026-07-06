"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type PanInfo,
  type Variants,
} from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// Saree imagery used on the right side of the cover and every chapter spread.
const FTT_NAVBAR_LOGO = "/Ftt_logo_navbar.avif";
const COVER_BANNER = "/category/kanjiverram-lcp.webp";
const COVER_CARD_IMAGE = "/category/silk-lcp.webp";
const SAREE_IMAGES = [
  "/category/Organza.JPG",
  "/category/Chiffon.JPG",
  "/category/georgette.jpg",
  "/category/Cotton_Silk.JPG",
  "/category/kanji_mix.JPG",
  "/category/Kota_Cotton.jpg",
];

const sareeImageFor = (chapterNumber: string) => {
  const index = (Number.parseInt(chapterNumber, 10) - 1) % SAREE_IMAGES.length;
  return SAREE_IMAGES[(index + SAREE_IMAGES.length) % SAREE_IMAGES.length];
};

const storyChapters = [
  {
    number: "01",
    eyebrow: "Our Story",
    title: "Every saree deserves a second story.",
    shortTitle: "Second story",
    body: [
      "Somewhere in your home, folded away in silk and memory, a saree is waiting. It carried you through a wedding, a festival, a milestone that mattered. Then it was tucked away, preserved, but unworn.",
      "From the Trunk (FTT) was born from a simple, heartfelt belief: these sarees still have stories left to tell.",
    ],
    marginNote:
      "This is the opening belief: a saree is not finished when it is folded away.",
    tagline:
      "Set aside for a while, the saree keeps its story, ready for the next page.",
  },
  {
    number: "02",
    eyebrow: "The Heart of It",
    title: "Never just fabric.",
    shortTitle: "Never just fabric",
    body: [
      "A saree is never just fabric. It holds the memory of a celebration, the weight of an heirloom, the colour of a moment that once meant everything. Left in the trunk, that story pauses. Worn again by someone new, it begins all over again.",
      "From the Trunk (FTT) is a curated home for pre-loved and vintage sarees. Each one is authenticated, gently restored, and documented with its own provenance. Kanjeevaram silk, soft georgette, heirloom chiffon: every piece is unique.",
    ],
    marginNote:
      "Authentication, restoration, and provenance make the piece ready for its next chapter.",
    tagline:
      "A saree is more than thread. Cared for and kept, its story is ready for a new hand.",
  },
  {
    number: "03",
    eyebrow: "A Second Life",
    title: "A bridge between past and present.",
    shortTitle: "A second life",
    body: [
      "By giving your pre-loved sarees a second life, you’re not just clearing space, you’re passing on heritage, emotion, and craftsmanship.",
      "Each saree becomes a bridge between past and present, finding new meaning in someone else’s journey.",
    ],
    marginNote:
      "A second life is not about resale alone. It is about transfer of care.",
    tagline:
      "Past and present meet in one length of silk, and the care crosses with it.",
  },
  {
    number: "04",
    eyebrow: "From the Trunk",
    title: "Two women, one trunk.",
    shortTitle: "Two women",
    body: [],
    split: [
      {
        label: "For the woman with a saree to give",
        text: "You’ve kept it safe for years. Now let it live. Pass on the silk, the craft, the heritage, and make space for what’s next. Every saree you share finds a new occasion, a new shoulder, a new story.",
      },
      {
        label: "For the woman looking for one",
        text: "Find a saree that already carries meaning: a pre-loved, restored piece that’s exquisite, timeless, and far kinder to your wallet than buying new. Wear a piece of someone’s history into a moment of your own.",
      },
    ],
    marginNote:
      "FTT serves both sides of the story: the giver and the finder.",
    tagline:
      "It takes two to turn the page: the one who gives, and the one who finds.",
  },
  {
    number: "05",
    eyebrow: "Why It Matters",
    title: "Every saree worn again is one less made new.",
    shortTitle: "Why it matters",
    body: [
      "Less waste. Less excess. A conscious, sustainable way to celebrate timeless fashion.",
      "Buy used. Don’t buy and use.",
    ],
    marginNote:
      "Some treasures deserve another chapter. Choose pre-loved over new.",
    tagline:
      "To wear again is to take less and give more. A conscious kind of beautiful.",
  },
  {
    number: "06",
    eyebrow: "The Promise",
    title: "At From the Trunk, we don’t just collect sarees.",
    shortTitle: "The promise",
    body: [
      "We honour them.",
      "We preserve their stories.",
      "And we help them be loved all over again.",
    ],
    promise: true,
    marginNote: "The final promise:",
    tagline:
      "The book closes, and the saree carries on. Its story begins again, with someone new.",
  },
] as const;

type StoryChapter = (typeof storyChapters)[number];
type ChapterNavItem = {
  index: number;
  label: string;
  number: string;
};

const pageVariants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 84 : -84,
    rotateY: direction > 0 ? -18 : 18,
    scale: 0.985,
    filter: "blur(8px)",
  }),
  center: {
    opacity: 1,
    x: 0,
    rotateY: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: 0.62,
      ease: [0.2, 0.76, 0.18, 1],
    },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -84 : 84,
    rotateY: direction > 0 ? 18 : -18,
    scale: 0.985,
    filter: "blur(8px)",
    transition: {
      duration: 0.42,
      ease: [0.4, 0, 0.2, 1],
    },
  }),
};

const coverVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 28,
    scale: 0.985,
  },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.72,
      ease: [0.2, 0.76, 0.18, 1],
      staggerChildren: 0.09,
    },
  },
};

const fadeUp: Variants = {
  hidden: {
    opacity: 0,
    y: 18,
    filter: "blur(6px)",
  },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.58,
      ease: [0.2, 0.76, 0.18, 1],
    },
  },
};

export default function OurStoryPage() {
  const reduceMotion = useReducedMotion();
  const isFramed = useStoryFrameMode();
  const [pageIndex, setPageIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const totalPages = storyChapters.length + 1;
  const isCover = pageIndex === 0;
  const activeChapter = isCover ? null : storyChapters[pageIndex - 1];
  const progress = Math.round((pageIndex / (totalPages - 1)) * 100);

  const chapterNav = useMemo(
    () =>
      storyChapters.map((chapter, index) => ({
        index: index + 1,
        label: chapter.shortTitle,
        number: chapter.number,
      })),
    [],
  );

  const goToPage = useCallback((nextIndex: number) => {
    const safeIndex = Math.min(Math.max(nextIndex, 0), totalPages - 1);
    if (safeIndex === pageIndex) return;

    setDirection(safeIndex > pageIndex ? 1 : -1);
    setPageIndex(safeIndex);
  }, [pageIndex, totalPages]);

  const goNext = useCallback(() => goToPage(pageIndex + 1), [goToPage, pageIndex]);
  const goPrev = useCallback(() => goToPage(pageIndex - 1), [goToPage, pageIndex]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (reduceMotion) return;

    if (info.offset.x < -90) goNext();
    if (info.offset.x > 90) goPrev();
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "Home") goToPage(0);
      if (event.key === "End") goToPage(totalPages - 1);
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [goNext, goPrev, goToPage, totalPages]);

  if (isFramed) {
    return (
      <div className="overflow-hidden bg-[#FDF7F1] text-[#0E0D0E]">
        <StoryDesktopFrame
          activeChapter={activeChapter}
          chapterNav={chapterNav}
          direction={direction}
          goNext={goNext}
          goPrev={goPrev}
          goToPage={goToPage}
          handleDragEnd={handleDragEnd}
          isCover={isCover}
          pageIndex={pageIndex}
          reduceMotion={Boolean(reduceMotion)}
          totalPages={totalPages}
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-[#FDF7F1] text-[#0E0D0E]">
      <section className="relative min-h-[calc(100svh-8rem)] px-3 py-4 sm:px-5 lg:px-7 lg:py-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.45]"
          aria-hidden="true"
        >
          <div className="absolute left-[-8rem] top-10 h-96 w-96 rounded-full bg-[#B39152]/10 blur-3xl" />
          <div className="absolute right-[-9rem] top-1/3 h-[34rem] w-[34rem] rounded-full bg-[#141D46]/8 blur-3xl" />
          <div className="absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-[#601D1C]/8 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-[#B39152]">
                From the Trunk
              </p>
              <h1 className="mt-2 font-serif text-3xl leading-none text-[#141D46] sm:text-4xl">
                Our Story Book
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="rounded-full border-[#B39152]/45 bg-[#FFFCF8] text-[#601D1C] hover:bg-[#B39152]/10"
                  >
                    <Menu className="mr-2 h-4 w-4" />
                    Contents
                  </Button>
                </DialogTrigger>

                <DialogContent className="border-[#E7DDD4] bg-[#FDF7F1] sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle className="font-serif text-3xl text-[#141D46]">
                      Story contents
                    </DialogTitle>
                  </DialogHeader>

                  <div className="mt-2 grid gap-2">
                    <button
                      type="button"
                      onClick={() => goToPage(0)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left transition",
                        pageIndex === 0
                          ? "border-[#B39152] bg-[#141D46] text-[#FDF7F1]"
                          : "border-[#E7DDD4] bg-[#FFFCF8] text-[#601D1C]/70 hover:border-[#B39152]/60",
                      )}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
                        Cover
                      </span>
                      <span className="mt-1 block font-serif text-xl">
                        Elegance, given a second life
                      </span>
                    </button>

                    {chapterNav.map((item) => (
                      <button
                        key={item.number}
                        type="button"
                        onClick={() => goToPage(item.index)}
                        className={cn(
                          "rounded-2xl border px-4 py-3 text-left transition",
                          pageIndex === item.index
                            ? "border-[#B39152] bg-[#141D46] text-[#FDF7F1]"
                            : "border-[#E7DDD4] bg-[#FFFCF8] text-[#601D1C]/70 hover:border-[#B39152]/60",
                        )}
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
                          Chapter {item.number}
                        </span>
                        <span className="mt-1 block font-serif text-xl">
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>

              <Button
                variant="outline"
                onClick={goPrev}
                disabled={pageIndex === 0}
                className="rounded-full border-[#E7DDD4] bg-[#FFFCF8] text-[#601D1C] hover:bg-[#B39152]/10"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>

              <Button
                onClick={goNext}
                disabled={pageIndex === totalPages - 1}
                className="rounded-full bg-[#141D46] text-[#FDF7F1] hover:bg-[#0E0D0E]"
              >
                Next page
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mb-3 rounded-[1.25rem] border border-[#E7DDD4] bg-[#FFFCF8]/88 p-3 shadow-[0_12px_34px_rgba(20,29,70,0.07)] backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-medium text-[#601D1C]/60">
                {isCover
                  ? "Cover"
                  : `Chapter ${activeChapter?.number} · ${activeChapter?.shortTitle}`}
              </p>
              <p className="text-xs font-medium text-[#601D1C]/60">
                Page {pageIndex + 1} of {totalPages}
              </p>
            </div>
            <Progress
              aria-label="Story progress"
              value={progress}
              className="mt-3 h-1.5 bg-[#E7DDD4] [&>div]:bg-[#B39152]"
            />
          </div>

          <div className="relative mx-auto max-w-6xl [perspective:2200px]">
            <button
              type="button"
              onClick={goPrev}
              disabled={pageIndex === 0}
              aria-label="Previous page"
              className="absolute left-1 top-1/2 z-30 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-[#B39152]/45 bg-[#FDF7F1]/95 text-[#601D1C] shadow-[0_12px_30px_rgba(20,29,70,0.22)] backdrop-blur transition hover:border-[#B39152] hover:bg-[#B39152]/12 disabled:cursor-not-allowed disabled:opacity-30 sm:left-2 xl:-left-6"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={pageIndex === totalPages - 1}
              aria-label="Next page"
              className="absolute right-1 top-1/2 z-30 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-[#B39152]/45 bg-[#FDF7F1]/95 text-[#601D1C] shadow-[0_12px_30px_rgba(20,29,70,0.22)] backdrop-blur transition hover:border-[#B39152] hover:bg-[#B39152]/12 disabled:cursor-not-allowed disabled:opacity-30 sm:right-2 xl:-right-6"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            <div
              className="pointer-events-none absolute inset-y-8 left-1/2 z-20 hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[#B39152]/30 to-transparent lg:block"
              aria-hidden="true"
            />

            <AnimatePresence mode="wait" custom={direction}>
              {isCover ? (
                <CoverPage
                  key="cover"
                  reduceMotion={Boolean(reduceMotion)}
                  onOpen={goNext}
                />
              ) : activeChapter ? (
                <BookSpread
                  key={activeChapter.number}
                  chapter={activeChapter}
                  direction={direction}
                  reduceMotion={Boolean(reduceMotion)}
                  isFinal={pageIndex === totalPages - 1}
                  onNext={goNext}
                  onPrev={goPrev}
                  onDragEnd={handleDragEnd}
                />
              ) : null}
            </AnimatePresence>
          </div>

          <div className="mt-3 flex justify-center">
            <div className="flex max-w-full gap-2 overflow-x-auto rounded-full border border-[#E7DDD4] bg-[#FFFCF8] p-2 shadow-[0_12px_34px_rgba(20,29,70,0.07)]">
              <button
                type="button"
                onClick={() => goToPage(0)}
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-semibold transition",
                  pageIndex === 0
                    ? "border-[#141D46] bg-[#141D46] text-[#FDF7F1]"
                    : "border-[#E7DDD4] bg-[#FDF7F1] text-[#601D1C]/60 hover:border-[#B39152]",
                )}
                aria-label="Go to cover"
              >
                C
              </button>

              {storyChapters.map((chapter, index) => {
                const targetPage = index + 1;
                const active = pageIndex === targetPage;

                return (
                  <button
                    key={chapter.number}
                    type="button"
                    onClick={() => goToPage(targetPage)}
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-semibold transition",
                      active
                        ? "border-[#141D46] bg-[#141D46] text-[#FDF7F1]"
                        : "border-[#E7DDD4] bg-[#FDF7F1] text-[#601D1C]/60 hover:border-[#B39152]",
                    )}
                    aria-label={`Go to chapter ${chapter.number}`}
                  >
                    {targetPage}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StoryDesktopFrame({
  activeChapter,
  chapterNav,
  direction,
  goNext,
  goPrev,
  goToPage,
  handleDragEnd,
  isCover,
  pageIndex,
  reduceMotion,
  totalPages,
}: {
  activeChapter: StoryChapter | null;
  chapterNav: ChapterNavItem[];
  direction: number;
  goNext: () => void;
  goPrev: () => void;
  goToPage: (nextIndex: number) => void;
  handleDragEnd: (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => void;
  isCover: boolean;
  pageIndex: number;
  reduceMotion: boolean;
  totalPages: number;
}) {
  return (
    <section className="relative px-2 py-2 sm:px-4 lg:px-5">
      <div className="mx-auto grid h-[calc(100svh-8.75rem)] min-h-[min(34rem,calc(100svh-8.75rem))] max-h-[52rem] max-w-[96rem] grid-cols-[minmax(8.5rem,20%)_minmax(0,1fr)] gap-2 overflow-hidden rounded-[1.8rem] bg-[#FDF7F1] shadow-[0_24px_80px_rgba(20,29,70,0.10)] md:grid-cols-[minmax(10rem,20%)_minmax(0,1fr)] lg:grid-cols-[minmax(12rem,20%)_minmax(0,1fr)]">
        <StoryDesktopSpine
          chapterNav={chapterNav}
          goToPage={goToPage}
          pageIndex={pageIndex}
        />

        <div className="relative min-w-0 overflow-hidden rounded-[1.65rem] border border-[#B39152]/16 bg-[#FFFCF8]">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_22%,rgba(179,145,82,0.10),transparent_30%),radial-gradient(circle_at_18%_90%,rgba(20,29,70,0.075),transparent_34%)]"
            aria-hidden="true"
          />

          <StoryBookControls
            goNext={goNext}
            goPrev={goPrev}
            pageIndex={pageIndex}
            totalPages={totalPages}
          />

          <div className="relative flex h-full min-h-0 items-center justify-center px-5 py-3 pr-16 xl:px-9 xl:py-4 xl:pr-20">
            <div className="relative flex min-h-0 w-full flex-1 items-center justify-center self-stretch [perspective:2200px]">
              <div className="h-full max-h-full w-full max-w-[78rem] self-stretch">
                <AnimatePresence mode="wait" custom={direction}>
                  {isCover ? (
                    <CoverPage
                      key="cover"
                      framed
                      reduceMotion={reduceMotion}
                      onOpen={goNext}
                    />
                  ) : activeChapter ? (
                    <BookSpread
                      key={activeChapter.number}
                      framed
                      chapter={activeChapter}
                      direction={direction}
                      reduceMotion={reduceMotion}
                      isFinal={pageIndex === totalPages - 1}
                      onNext={goNext}
                      onPrev={goPrev}
                      onDragEnd={handleDragEnd}
                    />
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StoryDesktopSpine({
  chapterNav,
  goToPage,
  pageIndex,
}: {
  chapterNav: ChapterNavItem[];
  goToPage: (nextIndex: number) => void;
  pageIndex: number;
}) {
  return (
    <aside className="relative min-h-0 overflow-hidden rounded-[1.65rem] bg-[linear-gradient(160deg,#601D1C_0%,#141D46_68%,#10183B_100%)] text-[#FDF7F1] shadow-[0_20px_64px_rgba(20,29,70,0.22)]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(179,145,82,0.22),transparent_24%),radial-gradient(circle_at_90%_90%,rgba(20,29,70,0.28),transparent_34%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[#B39152]/42"
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full flex-col justify-between p-4 xl:p-5">
        <div className="flex justify-end">
          <StoryContentsDialog
            chapterNav={chapterNav}
            currentPage={pageIndex}
            onSelectPage={goToPage}
            triggerVariant="icon"
          />
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center py-5">
          <div className="flex items-center justify-center gap-5 xl:gap-7">
            <h1
              className="font-serif text-[clamp(1.6rem,min(5.2vw,6vh),6.35rem)] font-medium leading-[0.82] tracking-[-0.055em] text-[#FDF7F1]"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              OUR STORY
            </h1>

            <p
              className="max-h-[min(28rem,calc(100svh-19rem))] text-[clamp(0.72rem,0.9vw,0.95rem)] font-semibold leading-6 tracking-[0.02em] text-[#FDF7F1]/76"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              A book-like journey through the sarees, memories, and second
              chapters behind From the Trunk.
            </p>
          </div>
        </div>

        <div className="h-8" aria-hidden="true" />
      </div>
    </aside>
  );
}

function StoryBookControls({
  goNext,
  goPrev,
  pageIndex,
  totalPages,
}: {
  goNext: () => void;
  goPrev: () => void;
  pageIndex: number;
  totalPages: number;
}) {
  return (
    <div className="absolute right-4 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-3 xl:right-6">
      <button
        type="button"
        onClick={goPrev}
        disabled={pageIndex === 0}
        aria-label="Previous story page"
        className="grid h-11 w-11 place-items-center rounded-full border border-[#B39152]/40 bg-[#141D46] text-[#FDF7F1] shadow-[0_14px_34px_rgba(20,29,70,0.18)] backdrop-blur transition hover:border-[#B39152] hover:bg-[#10183B] disabled:cursor-not-allowed disabled:bg-[#FDF7F1]/88 disabled:text-[#141D46]/30 disabled:opacity-70"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={goNext}
        disabled={pageIndex === totalPages - 1}
        aria-label="Next story page"
        className="grid h-11 w-11 place-items-center rounded-full border border-[#B39152]/40 bg-[#141D46] text-[#FDF7F1] shadow-[0_14px_34px_rgba(20,29,70,0.18)] backdrop-blur transition hover:border-[#B39152] hover:bg-[#10183B] disabled:cursor-not-allowed disabled:bg-[#FDF7F1]/88 disabled:text-[#141D46]/30 disabled:opacity-70"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function StoryContentsDialog({
  chapterNav,
  currentPage,
  onSelectPage,
  triggerVariant = "pill",
}: {
  chapterNav: ChapterNavItem[];
  currentPage: number;
  onSelectPage: (nextIndex: number) => void;
  triggerVariant?: "icon" | "pill";
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {triggerVariant === "icon" ? (
          <Button
            variant="outline"
            size="icon"
            aria-label="Open story contents"
            className="rounded-full border-[#B39152]/45 bg-[#FDF7F1]/96 text-[#601D1C] shadow-[0_14px_34px_rgba(20,29,70,0.12)] hover:bg-[#B39152]/14"
          >
            <Menu className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            variant="outline"
            className="rounded-full border-[#B39152]/45 bg-[#FFFCF8] text-[#601D1C] hover:bg-[#B39152]/10"
          >
            <Menu className="mr-2 h-4 w-4" />
            Contents
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="border-[#E7DDD4] bg-[#FDF7F1] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-3xl text-[#141D46]">
            Story contents
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 grid gap-2">
          <button
            type="button"
            onClick={() => onSelectPage(0)}
            className={cn(
              "rounded-2xl border px-4 py-3 text-left transition",
              currentPage === 0
                ? "border-[#B39152] bg-[#141D46] text-[#FDF7F1]"
                : "border-[#E7DDD4] bg-[#FFFCF8] text-[#601D1C]/70 hover:border-[#B39152]/60",
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
              Cover
            </span>
            <span className="mt-1 block font-serif text-xl">
              Elegance, given a second life
            </span>
          </button>

          {chapterNav.map((item) => (
            <button
              key={item.number}
              type="button"
              onClick={() => onSelectPage(item.index)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left transition",
                currentPage === item.index
                  ? "border-[#B39152] bg-[#141D46] text-[#FDF7F1]"
                  : "border-[#E7DDD4] bg-[#FFFCF8] text-[#601D1C]/70 hover:border-[#B39152]/60",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
                Chapter {item.number}
              </span>
              <span className="mt-1 block font-serif text-xl">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CoverPage({
  reduceMotion,
  onOpen,
  framed = false,
}: {
  reduceMotion: boolean;
  onOpen: () => void;
  framed?: boolean;
}) {
  return (
    <motion.article
      initial={false}
      animate="show"
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.985, y: -16 }}
      variants={coverVariants}
      className={cn(
        "relative overflow-hidden rounded-[1.6rem] border border-[#141D46]/15 bg-[#141D46] shadow-[0_30px_90px_rgba(20,29,70,0.22)]",
        framed
          ? "h-full min-h-0"
          : "min-h-[min(32rem,calc(100svh-19rem))] lg:min-h-[min(34rem,calc(100svh-18rem))]",
      )}
    >
      {/* Banner image background with a blue shade over it. */}
      <Image
        src={COVER_BANNER}
        alt=""
        fill
        priority
        fetchPriority="high"
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,29,70,0.94)_0%,rgba(16,24,59,0.88)_55%,rgba(96,29,28,0.82)_150%)]" />
      <div className="absolute inset-4 rounded-[1.35rem] border border-[#B39152]/18" />

      <div
        className={cn(
          "relative z-10 grid gap-5 text-[#FDF7F1] lg:grid-cols-[0.95fr_1.05fr]",
          framed
            ? "h-full min-h-0 p-5 lg:p-6 xl:p-7"
            : "min-h-[min(32rem,calc(100svh-19rem))] p-5 sm:p-6 lg:min-h-[min(34rem,calc(100svh-18rem))] lg:p-7",
        )}
      >
        <div className="flex min-h-0 flex-col justify-between overflow-y-auto pr-1">
          <motion.div variants={fadeUp}>
            <Badge className="rounded-full border border-[#B39152]/35 bg-[#FDF7F1]/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.24em] text-[#B39152] hover:bg-[#FDF7F1]/10">
              FTT · Our Story
            </Badge>

            <h2
              className={cn(
                "mt-5 max-w-2xl text-balance font-serif font-medium leading-[0.88] tracking-[-0.035em]",
                framed
                  ? "text-[clamp(2.2rem,4.5vw,5.15rem)]"
                  : "text-[clamp(2.45rem,5.6vw,5.7rem)]",
              )}
            >
              Elegance, given a second life.
            </h2>

            <p className="mt-5 max-w-xl text-sm leading-7 text-[#FDF7F1]/76">
              Open this story like a trunk: page by page, memory by memory,
              until the saree finds its next chapter.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={onOpen}
              className="h-12 rounded-full bg-[#B39152] px-6 text-[#0E0D0E] hover:bg-[#C8A45F]"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Open the book
            </Button>

            <Button
              asChild
              variant="outline"
              className="h-12 rounded-full border-[#FDF7F1]/35 bg-transparent px-6 text-[#FDF7F1] hover:bg-[#FDF7F1]/10 hover:text-[#FDF7F1]"
            >
              <Link href="/collection">Find your saree</Link>
            </Button>
          </motion.div>
        </div>

        <motion.div
          variants={fadeUp}
          className={cn(
            "relative grid place-items-center overflow-hidden rounded-[1.35rem] border border-[#B39152]/22",
            framed ? "h-full min-h-0" : "min-h-[16rem] lg:min-h-[21rem]",
          )}
        >
          {/* Saree image — no shade overlay. */}
          <Image
            src={COVER_CARD_IMAGE}
            alt="A restored From the Trunk saree"
            fill
            sizes="(max-width: 1024px) 100vw, 45vw"
            className="object-cover"
          />

          <motion.div
            animate={
              reduceMotion
                ? undefined
                : {
                    rotate: [0, 2.5, -2.5, 0],
                    scale: [1, 1.015, 1],
                  }
            }
            transition={{
              duration: 9,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="relative z-10 grid h-40 w-40 place-items-center rounded-full border border-[#B39152]/45 bg-[#FDF7F1] shadow-[0_22px_80px_rgba(0,0,0,.32)] sm:h-52 sm:w-52"
          >
            <Image
              src={FTT_NAVBAR_LOGO}
              alt="From the Trunk"
              width={220}
              height={104}
              className="h-auto w-28 object-contain sm:w-36"
            />
          </motion.div>

          <div className="absolute bottom-4 left-4 right-4 z-10 rounded-[1.15rem] border border-white/12 bg-[#0E0D0E]/45 p-3 backdrop-blur">
            <p className="text-xs leading-6 text-[#FDF7F1]/85">
              Swipe left, press the arrow key, or use “Next page” to turn the
              story.
            </p>
          </div>
        </motion.div>
      </div>
    </motion.article>
  );
}

function BookSpread({
  chapter,
  direction,
  framed = false,
  reduceMotion,
  isFinal,
  onNext,
  onPrev,
  onDragEnd,
}: {
  chapter: StoryChapter;
  direction: number;
  framed?: boolean;
  reduceMotion: boolean;
  isFinal: boolean;
  onNext: () => void;
  onPrev: () => void;
  onDragEnd: (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
}) {
  return (
    <motion.article
      custom={direction}
      variants={pageVariants}
      initial={reduceMotion ? false : "enter"}
      animate="center"
      exit={reduceMotion ? undefined : "exit"}
      drag={reduceMotion ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.12}
      onDragEnd={onDragEnd}
      className={cn(
        "relative overflow-hidden rounded-[2rem] border border-[#DCCFC2] bg-[#FFFCF8] shadow-[0_30px_90px_rgba(20,29,70,0.18)]",
        framed && "h-full min-h-0",
      )}
      style={{
        transformStyle: "preserve-3d",
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(14,13,14,.04),transparent_8%,transparent_92%,rgba(14,13,14,.06))]" />
      <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-[#DCCFC2]/45 to-transparent" />
      <div
        className={cn(
          "relative grid lg:grid-cols-2",
          framed
            ? "h-full min-h-0 grid-rows-1"
            : "min-h-[min(31rem,calc(100svh-20rem))] lg:min-h-[min(33rem,calc(100svh-19rem))]",
        )}
      >
        <StoryLeftPage chapter={chapter} framed={framed} />
        <StoryRightPage
          chapter={chapter}
          framed={framed}
          reduceMotion={reduceMotion}
        />
      </div>

      {!framed ? (
        <div className="relative z-10 flex flex-col gap-3 border-t border-[#E7DDD4] bg-[#FDF7F1]/80 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onPrev}
            className="rounded-full border-[#B39152]/45 bg-[#FFFCF8] text-[#601D1C] hover:bg-[#B39152]/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Previous page
          </Button>

          <div className="flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#B39152]" />
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-[#601D1C]/50">
              Drag or use arrow keys to turn pages
            </p>
            <span className="h-1.5 w-1.5 rounded-full bg-[#B39152]" />
          </div>

          {isFinal ? (
            <Button
              asChild
              className="rounded-full bg-[#141D46] text-[#FDF7F1] hover:bg-[#0E0D0E]"
            >
              <Link href="/collection">
                Find your saree
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onNext}
              className="rounded-full bg-[#141D46] text-[#FDF7F1] hover:bg-[#0E0D0E]"
            >
              Turn page
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      ) : null}
    </motion.article>
  );
}

function StoryLeftPage({
  chapter,
  framed = false,
}: {
  chapter: StoryChapter;
  framed?: boolean;
}) {
  const isPromise = "promise" in chapter && chapter.promise;

  return (
    <section
      className={cn(
        "relative border-b border-[#E7DDD4] p-5 sm:p-6 lg:border-b-0 lg:border-r lg:p-7",
        framed && "min-h-0 overflow-y-auto lg:p-6 xl:p-7",
      )}
    >
      <div className="absolute right-5 top-5 hidden text-[6rem] font-serif leading-none text-[#B39152]/8 lg:block">
        {chapter.number}
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4">
          <Badge className="rounded-full border border-[#B39152]/35 bg-[#B39152]/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[#601D1C] hover:bg-[#B39152]/10">
            Chapter {chapter.number}
          </Badge>

          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#B39152]">
            FTT
          </p>
        </div>

        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.34em] text-[#B39152]">
          {chapter.eyebrow}
        </p>

        <h2
          className={cn(
            "mt-4 max-w-2xl text-balance font-serif leading-[0.92] tracking-[-0.035em] text-[#141D46]",
            framed
              ? "text-[clamp(1.85rem,3.65vw,4.2rem)]"
              : "text-[clamp(2rem,4.6vw,4.7rem)]",
          )}
        >
          {chapter.title}
        </h2>

        {chapter.body.length > 0 ? (
          <div className="mt-5 space-y-3">
            {chapter.body.map((paragraph, index) => (
              <motion.p
                key={paragraph}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.12 + index * 0.08,
                  duration: 0.52,
                  ease: [0.2, 0.76, 0.18, 1],
                }}
                className={cn(
                  "max-w-xl text-sm leading-6 text-[#601D1C]/72",
                  isPromise && "font-serif text-2xl leading-tight text-[#601D1C]",
                )}
              >
                {paragraph}
              </motion.p>
            ))}
          </div>
        ) : null}

        {"split" in chapter && chapter.split ? (
          <div className="mt-5 grid gap-3">
            {chapter.split.map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.16 + index * 0.1,
                  duration: 0.54,
                  ease: [0.2, 0.76, 0.18, 1],
                }}
                className={cn(
                  "rounded-[1.2rem] border p-4",
                  index === 0
                    ? "border-[#B39152]/35 bg-[#B39152]/10"
                    : "border-[#E7DDD4] bg-[#FDF7F1]",
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
                  {item.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#601D1C]/72">
                  {item.text}
                </p>
              </motion.div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StoryRightPage({
  chapter,
  framed = false,
  reduceMotion,
}: {
  chapter: StoryChapter;
  framed?: boolean;
  reduceMotion: boolean;
}) {
  const isPromise = "promise" in chapter && chapter.promise;
  const sareeImage = sareeImageFor(chapter.number);

  return (
    <section
      className={cn(
        "relative overflow-hidden p-5 sm:p-6 lg:p-7",
        framed && "min-h-0 lg:p-6 xl:p-7",
      )}
    >
      {/* Saree image sits behind the right-page content. */}
      <Image
        src={sareeImage}
        alt=""
        fill
        sizes="(max-width: 1024px) 100vw, 36vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#FDF7F1]/72 via-[#FDF7F1]/86 to-[#FDF7F1]/94" />

      <div
        className={cn(
          "relative z-10 flex min-h-full flex-col justify-between gap-4",
          framed && "h-full min-h-0 overflow-y-auto pr-1",
        )}
      >
        <div className="space-y-4">
          {/* Margin note — note only (no label), with the FTT logo mark. */}
          <div className="overflow-hidden rounded-[1.35rem] border border-[#E7DDD4] bg-[#141D46] p-4 text-[#FDF7F1] shadow-[0_18px_50px_rgba(20,29,70,0.14)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-serif text-xl leading-tight sm:text-2xl">
                  {chapter.marginNote}
                </p>
                {isPromise ? (
                  <PromiseTypewriter reduceMotion={reduceMotion} />
                ) : null}
              </div>

              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#FDF7F1] p-2.5">
                <Image
                  src={FTT_NAVBAR_LOGO}
                  alt="From the Trunk"
                  width={48}
                  height={24}
                  className="h-auto w-full object-contain"
                />
              </div>
            </div>
          </div>

          {isPromise ? (
            <PromiseCombinedCard />
          ) : null}
        </div>

        <div className="rounded-[1.35rem] border border-[#E7DDD4] bg-[#FDF7F1]/88 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#B39152]">
            Page {chapter.number}
          </p>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#E7DDD4]">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, ease: [0.2, 0.76, 0.18, 1] }}
              className="h-full origin-left rounded-full bg-[#B39152]"
            />
          </div>

          <p className="mt-3 text-sm font-semibold leading-6 text-[#141D46]">
            {chapter.tagline}
          </p>
        </div>
      </div>
    </section>
  );
}

function PromiseTypewriter({ reduceMotion }: { reduceMotion: boolean }) {
  const lineOne = "not pre-owned,";
  const lineTwo = "re-stored.";
  const [typedLineOne, setTypedLineOne] = useState("");
  const [typedLineTwo, setTypedLineTwo] = useState("");
  const displayLineOne = reduceMotion ? lineOne : typedLineOne;
  const displayLineTwo = reduceMotion ? lineTwo : typedLineTwo;

  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    const timers: number[] = [];
    const typeLine = (
      text: string,
      setText: (value: string) => void,
      startDelay: number,
    ) => {
      for (let index = 1; index <= text.length; index += 1) {
        timers.push(
          window.setTimeout(() => {
            setText(text.slice(0, index));
          }, startDelay + index * 42),
        );
      }
    };

    typeLine(lineOne, setTypedLineOne, 120);
    typeLine(lineTwo, setTypedLineTwo, 120 + lineOne.length * 42 + 180);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [reduceMotion]);

  return (
    <p
      aria-label={`${lineOne} ${lineTwo}`}
      className="mt-3 font-serif text-[clamp(1.75rem,3.4vw,3.4rem)] leading-[0.95] text-[#FDF7F1]"
    >
      <span aria-hidden="true" className="block">
        {displayLineOne}
      </span>
      <span aria-hidden="true" className="block text-[#B39152]">
        {displayLineTwo}
      </span>
    </p>
  );
}

function PromiseCombinedCard() {
  const ideas = [
    {
      title: "Honour",
      body: "We treat every saree as memory, not inventory.",
    },
    {
      title: "Preserve",
      body: "We document condition, provenance, and craft with care.",
    },
    {
      title: "Re-stored",
      body: "We help each saree begin again with someone new.",
    },
  ];

  return (
    <div className="rounded-[1.25rem] border border-[#E7DDD4] bg-[#FFFCF8] p-4">
      <div className="grid gap-4">
        {ideas.map((idea) => (
          <div key={idea.title}>
            <p className="font-serif text-2xl text-[#141D46]">{idea.title}</p>
            <p className="mt-1 text-sm leading-6 text-[#601D1C]/65">
              {idea.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function useStoryFrameMode() {
  const [isFramed, setIsFramed] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(
      "(min-width: 980px), (min-width: 768px) and (orientation: landscape)",
    );

    const syncFrameMode = () => {
      setIsFramed(media.matches);
    };

    syncFrameMode();
    media.addEventListener("change", syncFrameMode);

    return () => {
      media.removeEventListener("change", syncFrameMode);
    };
  }, []);

  return isFramed;
}
