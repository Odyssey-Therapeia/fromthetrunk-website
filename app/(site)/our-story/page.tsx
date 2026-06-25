"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  Feather,
  Heart,
  Menu,
  Sparkles,
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

const storyChapters = [
  {
    number: "01",
    eyebrow: "Our Story",
    title: "Every saree deserves a second story.",
    shortTitle: "Second story",
    body: [
      "Somewhere in your home, folded away in silk and memory, a saree is waiting. It carried you through a wedding, a festival, a milestone that mattered. Then it was tucked away — preserved, but unworn.",
      "From the Trunk (FTT) was born from a simple, heartfelt belief: these sarees still have stories left to tell.",
    ],
    marginNote:
      "This is the opening belief: a saree is not finished when it is folded away.",
  },
  {
    number: "02",
    eyebrow: "The Heart of It",
    title: "Never just fabric.",
    shortTitle: "Never just fabric",
    body: [
      "A saree is never just fabric. It holds the memory of a celebration, the weight of an heirloom, the colour of a moment that once meant everything. Left in the trunk, that story pauses. Worn again — by someone new — it begins all over again.",
      "From the Trunk (FTT) is a curated home for pre-loved and vintage sarees — each one authenticated, gently restored, and documented with its own provenance. Kanjeevaram silk, soft georgette, heirloom chiffon: every piece is one of one.",
    ],
    marginNote:
      "Authentication, restoration, and provenance make the piece ready for its next chapter.",
  },
  {
    number: "03",
    eyebrow: "A Second Life",
    title: "A bridge between past and present.",
    shortTitle: "A second life",
    body: [
      "By giving your pre-loved sarees a second life, you’re not just clearing space — you’re passing on heritage, emotion, and craftsmanship.",
      "Each saree becomes a bridge between past and present, finding new meaning in someone else’s journey.",
    ],
    marginNote:
      "A second life is not about resale alone. It is about transfer of care.",
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
        text: "You’ve kept it safe for years. Now let it live. Pass on the silk, the craft, the heritage — and make space for what’s next. Every saree you share finds a new occasion, a new shoulder, a new story.",
      },
      {
        label: "For the woman looking for one",
        text: "Find a saree that already carries meaning — a pre-loved, restored piece that’s exquisite, timeless, and far kinder to your wallet than buying new. Wear a piece of someone’s history into a moment of your own.",
      },
    ],
    marginNote:
      "FTT serves both sides of the story: the giver and the finder.",
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
      "Circular fashion becomes emotional when the object already carries memory.",
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
    marginNote:
      "The final promise: not pre-owned, re-storied.",
  },
] as const;

type StoryChapter = (typeof storyChapters)[number];

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

  const goToPage = (nextIndex: number) => {
    const safeIndex = Math.min(Math.max(nextIndex, 0), totalPages - 1);
    if (safeIndex === pageIndex) return;

    setDirection(safeIndex > pageIndex ? 1 : -1);
    setPageIndex(safeIndex);
  };

  const goNext = () => goToPage(pageIndex + 1);
  const goPrev = () => goToPage(pageIndex - 1);

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
  }, [pageIndex, totalPages]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#FDF7F1] text-[#0E0D0E]">
      <section className="relative px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.45]"
          aria-hidden="true"
        >
          <div className="absolute left-[-8rem] top-10 h-96 w-96 rounded-full bg-[#B39152]/10 blur-3xl" />
          <div className="absolute right-[-9rem] top-1/3 h-[34rem] w-[34rem] rounded-full bg-[#141D46]/8 blur-3xl" />
          <div className="absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-[#601D1C]/8 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
                        Every saree deserves a second story
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

          <div className="mb-5 rounded-[1.25rem] border border-[#E7DDD4] bg-[#FFFCF8]/88 p-3 shadow-[0_12px_34px_rgba(20,29,70,0.07)] backdrop-blur">
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
              value={progress}
              className="mt-3 h-1.5 bg-[#E7DDD4] [&>div]:bg-[#B39152]"
            />
          </div>

          <div className="relative mx-auto max-w-6xl [perspective:2200px]">
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

          <div className="mt-6 flex justify-center">
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
    </main>
  );
}

function CoverPage({
  reduceMotion,
  onOpen,
}: {
  reduceMotion: boolean;
  onOpen: () => void;
}) {
  return (
    <motion.article
      initial={reduceMotion ? false : "hidden"}
      animate="show"
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.985, y: -16 }}
      variants={coverVariants}
      className="relative min-h-[42rem] overflow-hidden rounded-[2rem] border border-[#141D46]/15 bg-[#141D46] shadow-[0_30px_90px_rgba(20,29,70,0.22)]"
      style={{
        background:
          "radial-gradient(circle at 20% 14%, rgba(179,145,82,.20), transparent 24%), radial-gradient(circle at 80% 86%, rgba(96,29,28,.55), transparent 28%), linear-gradient(135deg, #141D46 0%, #10183B 58%, #601D1C 150%)",
      }}
    >
      <div className="absolute inset-5 rounded-[1.6rem] border border-[#B39152]/18" />
      <div className="absolute left-0 top-0 h-full w-10 bg-gradient-to-r from-[#0E0D0E]/40 to-transparent" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(253,247,241,.75)_1px,transparent_1px),linear-gradient(90deg,rgba(253,247,241,.75)_1px,transparent_1px)] [background-size:54px_54px]" />

      <div className="relative z-10 grid min-h-[42rem] gap-8 p-6 text-[#FDF7F1] sm:p-8 lg:grid-cols-[0.95fr_1.05fr] lg:p-10">
        <div className="flex flex-col justify-between">
          <motion.div variants={fadeUp}>
            <Badge className="rounded-full border border-[#B39152]/35 bg-[#FDF7F1]/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.24em] text-[#B39152] hover:bg-[#FDF7F1]/10">
              FTT · Our Story
            </Badge>

            <h2 className="mt-8 max-w-2xl font-serif text-[clamp(3.4rem,8vw,8.3rem)] font-medium leading-[0.86] tracking-[-0.055em]">
              Every saree deserves a second story.
            </h2>

            <p className="mt-7 max-w-xl text-sm leading-7 text-[#FDF7F1]/72 sm:text-base">
              Open this story like a trunk: page by page, memory by memory,
              until the saree finds its next chapter.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
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
          className="relative grid min-h-[24rem] place-items-center overflow-hidden rounded-[1.5rem] border border-[#B39152]/22 bg-[#FDF7F1]/8 backdrop-blur"
        >
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
            className="grid h-64 w-64 place-items-center rounded-full border border-[#B39152]/42 bg-[#141D46]/60 shadow-[0_22px_80px_rgba(0,0,0,.28)] sm:h-80 sm:w-80"
          >
            <div className="text-center">
              <p className="font-serif text-7xl leading-none text-[#B39152] sm:text-8xl">
                FTT
              </p>
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.38em] text-[#FDF7F1]/60">
                The second story
              </p>
            </div>
          </motion.div>

          <div className="absolute bottom-5 left-5 right-5 rounded-[1.25rem] border border-white/12 bg-[#0E0D0E]/28 p-4 backdrop-blur">
            <p className="text-xs leading-6 text-[#FDF7F1]/72">
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
  reduceMotion,
  isFinal,
  onNext,
  onPrev,
  onDragEnd,
}: {
  chapter: StoryChapter;
  direction: number;
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
      className="relative overflow-hidden rounded-[2rem] border border-[#DCCFC2] bg-[#FFFCF8] shadow-[0_30px_90px_rgba(20,29,70,0.18)]"
      style={{
        transformStyle: "preserve-3d",
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(14,13,14,.04),transparent_8%,transparent_92%,rgba(14,13,14,.06))]" />
      <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-[#DCCFC2]/45 to-transparent" />
      <div className="relative grid min-h-[42rem] lg:grid-cols-2">
        <StoryLeftPage chapter={chapter} />
        <StoryRightPage chapter={chapter} />
      </div>

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
    </motion.article>
  );
}

function StoryLeftPage({ chapter }: { chapter: StoryChapter }) {
  const isPromise = "promise" in chapter && chapter.promise;

  return (
    <section className="relative border-b border-[#E7DDD4] p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
      <div className="absolute right-5 top-5 hidden text-[8rem] font-serif leading-none text-[#B39152]/8 lg:block">
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

        <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.34em] text-[#B39152]">
          {chapter.eyebrow}
        </p>

        <h2 className="mt-5 max-w-2xl font-serif text-[clamp(2.8rem,6vw,5.8rem)] leading-[0.9] tracking-[-0.045em] text-[#141D46]">
          {chapter.title}
        </h2>

        {chapter.body.length > 0 ? (
          <div className="mt-8 space-y-5">
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
                  "max-w-xl text-sm leading-7 text-[#601D1C]/72 sm:text-base sm:leading-8",
                  isPromise && "font-serif text-3xl leading-tight text-[#601D1C]",
                )}
              >
                {paragraph}
              </motion.p>
            ))}
          </div>
        ) : null}

        {"split" in chapter && chapter.split ? (
          <div className="mt-8 grid gap-4">
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
                  "rounded-[1.35rem] border p-5",
                  index === 0
                    ? "border-[#B39152]/35 bg-[#B39152]/10"
                    : "border-[#E7DDD4] bg-[#FDF7F1]",
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
                  {item.label}
                </p>
                <p className="mt-3 text-sm leading-7 text-[#601D1C]/72">
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

function StoryRightPage({ chapter }: { chapter: StoryChapter }) {
  const isSplit = "split" in chapter && chapter.split;
  const isPromise = "promise" in chapter && chapter.promise;

  return (
    <section className="relative overflow-hidden p-6 sm:p-8 lg:p-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(179,145,82,.16),transparent_28%),radial-gradient(circle_at_15%_85%,rgba(20,29,70,.08),transparent_32%)]" />

      <div className="relative z-10 flex min-h-full flex-col justify-between gap-8">
        <div>
          <div className="overflow-hidden rounded-[1.5rem] border border-[#E7DDD4] bg-[#141D46] p-5 text-[#FDF7F1] shadow-[0_18px_50px_rgba(20,29,70,0.14)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#B39152]">
                  Margin note
                </p>
                <p className="mt-3 font-serif text-3xl leading-tight">
                  {chapter.marginNote}
                </p>
              </div>

              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#B39152]/35 bg-[#FDF7F1]/10 text-[#B39152]">
                {isPromise ? (
                  <Heart className="h-5 w-5" />
                ) : isSplit ? (
                  <Feather className="h-5 w-5" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
              </div>
            </div>
          </div>

          {isPromise ? (
            <div className="mt-5 grid gap-3">
              <PromiseMiniCard title="Honour" body="We treat every saree as memory, not inventory." />
              <PromiseMiniCard title="Preserve" body="We document condition, provenance, and craft with care." />
              <PromiseMiniCard title="Re-story" body="We help each saree begin again with someone new." />
            </div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <BookSignal label="Authenticated" />
              <BookSignal label="Restored" />
              <BookSignal label="One of one" />
            </div>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-[#E7DDD4] bg-[#FDF7F1]/86 p-5">
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

          <p className="mt-4 text-xs leading-6 text-[#601D1C]/58">
            The page turns, but the saree does not lose its past. It simply
            carries it forward.
          </p>
        </div>
      </div>
    </section>
  );
}

function BookSignal({ label }: { label: string }) {
  return (
    <div className="rounded-[1.1rem] border border-[#E7DDD4] bg-[#FFFCF8] p-4">
      <span className="h-2 w-2 rounded-full bg-[#B39152]" />
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#601D1C]/60">
        {label}
      </p>
    </div>
  );
}

function PromiseMiniCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.25rem] border border-[#E7DDD4] bg-[#FFFCF8] p-4">
      <p className="font-serif text-2xl text-[#141D46]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#601D1C]/65">{body}</p>
    </div>
  );
}