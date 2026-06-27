"use client";

import HTMLFlipBook from "react-pageflip";
import Image from "next/image";
import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Menu,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Founder = {
  id: string;
  name: string;
  designation: string;
  image: string;
  storyHeading: string;
  about: string[];
  whyFTT: string[];
};

type BookPageKind =
  | "cover"
  | "founder-image"
  | "founder-story"
  | "founder-mobile"
  | "back-cover";

type BookPageData = {
  id: string;
  kind: BookPageKind;
  founder?: Founder;
  pageTitle?: string;
};

type FlipBookRef = {
  pageFlip: () => {
    flip: (pageNumber: number, corner?: "top" | "bottom") => void;
    flipNext: (corner?: "top" | "bottom") => void;
    flipPrev: (corner?: "top" | "bottom") => void;
  };
};

const founders: Founder[] = [
  {
    id: "meena",
    name: "Dr. Meena Gnanashekharan",
    designation: "CEO & Co-Founder",
    image: "/founder/meena-founder.jpg",
    storyHeading: "Care, craft, and a lighter cycle",
    about: [
      "Dr. Meena is an American Board Certified Psychiatrist specialising in Child, Adolescent and Adult Psychiatry — trained in the US and now rooted back in India. But alongside her clinical world lives a quieter, deeply personal one: a lifelong love for sarees.",
      "For Meena, the problem was never finding a saree she loved. It was finding a reason not to buy another one.",
    ],
    whyFTT: [
      "As someone passionate about sustainability, she sat with an uncomfortable truth — every new saree bought means resources spent, fabric produced, and often, another saree left unworn. She wanted a way to keep wearing and celebrating sarees without the weight of that cycle.",
      "From the Trunk became her answer: a space where beautiful sarees find new homes, new stories, and new lives — without anything going to waste.",
    ],
  },
  {
    id: "grace",
    name: "Grace Priscilla",
    designation: "COO & Co-Founder",
    image: "/founder/grace-founder.jpg",
    storyHeading: "A trunk full of unfinished stories",
    about: [
      "Grace is a psychologist by training, but fashion and sustainability have always lived rent-free in her mind. When the world started talking about sustainable fashion, she listened — and then she looked closer to home.",
      "The moment that changed everything happened on a family vacation. Tucked in her grandmother's room was an old trunk. Inside it, folded carefully and quietly forgotten, were sarees — dozens of them. Each one carrying a memory: a wedding, a festival, an ordinary Tuesday that had somehow mattered. None of them worn in years. None of them ready to be thrown away.",
    ],
    whyFTT: [
      "Grace couldn't stop thinking about it. Every household in India has that trunk. Every trunk holds those sarees. And every saree in it deserves to be worn again — not locked away, not discarded, but passed on.",
      "That is the idea From the Trunk is built on. Not just sustainable fashion — something more personal: the belief that a saree's story should never end with the person who first wore it.",
    ],
  },
  {
    id: "abraham",
    name: "Abraham Abel Bodala",
    designation: "CTO & Co-Founder",
    image: "/founder/abraham-founder.png",
    storyHeading: "Building trust for circular fashion",
    about: [
      "Abraham understood the idea the moment he heard it — and set out to build the technology that makes it real.",
      "He shapes the platform behind From the Trunk: discovery, trust, secure checkout, and the account experience — engineered so every part of the journey feels as considered as the sarees it carries.",
    ],
    whyFTT: [
      "Abraham builds for From the Trunk because circular fashion needs more than sentiment — it needs systems that make trust easy. Authentication, product detail, checkout, and account care all have to work with calm precision.",
      "For him, FTT is where heritage and technology meet, helping timeless sarees move into a modern, responsible commerce experience.",
    ],
  },
];


const pageEnter: Variants = {
  hidden: {
    opacity: 0,
    y: 18,
    filter: "blur(6px)",
  },
  show: (reduceMotion: boolean) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: reduceMotion
      ? { duration: 0 }
      : {
          duration: 0.52,
          ease: [0.2, 0.76, 0.18, 1],
        },
  }),
};

const rowStagger: Variants = {
  hidden: {},
  show: (reduceMotion: boolean) => ({
    transition: reduceMotion
      ? { staggerChildren: 0 }
      : {
          staggerChildren: 0.08,
        },
  }),
};

const BookPage = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode;
    className?: string;
    hard?: boolean;
  }
>(function BookPage({ children, className, hard = false }, ref) {
  return (
    <div
      ref={ref}
      data-density={hard ? "hard" : "soft"}
      className={cn("ftt-book-page relative overflow-hidden bg-[#FDF7F1]", className)}
    >
      {children}
    </div>
  );
});

BookPage.displayName = "BookPage";

export function FoundersPageClient() {
  const bookRef = useRef<FlipBookRef | null>(null);
  const reduceMotion = Boolean(useReducedMotion());
  const isSpread = useBookSpreadMode();
  const [currentPage, setCurrentPage] = useState(0);

  const pages = useMemo<BookPageData[]>(() => {
    if (isSpread) {
      return [
        { id: "cover", kind: "cover" },
        ...founders.flatMap((founder) => [
          {
            id: `${founder.id}-image`,
            kind: "founder-image" as const,
            founder,
          },
          {
            id: `${founder.id}-story`,
            kind: "founder-story" as const,
            founder,
          },
        ]),
        { id: "back-cover", kind: "back-cover" },
      ];
    }

    return [
      { id: "cover", kind: "cover" },
      ...founders.map((founder) => ({
        id: `${founder.id}-mobile`,
        kind: "founder-mobile" as const,
        founder,
      })),
      { id: "back-cover", kind: "back-cover" },
    ];
  }, [isSpread]);

  const goNext = () => {
    bookRef.current?.pageFlip().flipNext("bottom");
  };

  const goPrev = () => {
    bookRef.current?.pageFlip().flipPrev("bottom");
  };

  const goToPage = (index: number) => {
    bookRef.current?.pageFlip().flip(index, "bottom");
  };

  const openFounderPages = () => {
    bookRef.current?.pageFlip().flip(1, "bottom");
  };

  const activePage = Math.min(currentPage, pages.length - 1);

  return (
    <main className="min-h-screen overflow-hidden bg-[#FDF7F1] text-[#0E0D0E]">
      <section className="relative px-3 py-5 sm:px-6 lg:px-8 lg:py-10">
        <div className="pointer-events-none absolute inset-0 opacity-80">
          <div className="absolute left-[-9rem] top-16 h-[26rem] w-[26rem] rounded-full bg-[#B39152]/10 blur-3xl" />
          <div className="absolute right-[-10rem] top-1/3 h-[30rem] w-[30rem] rounded-full bg-[#141D46]/8 blur-3xl" />
          <div className="absolute bottom-[-9rem] left-1/3 h-[26rem] w-[26rem] rounded-full bg-[#601D1C]/8 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.36em] text-[#B39152]">
                From the Trunk
              </p>
              <h1 className="mt-2 font-serif text-[clamp(2.4rem,6vw,5rem)] leading-[0.92] text-[#141D46]">
                Our Founders
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#601D1C]/68 sm:text-base sm:leading-7">
                A book-like introduction to the people helping FTT give sarees
                their next life.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <ContentsDialog
                currentPage={activePage}
                onSelectPage={goToPage}
                pages={pages}
              />

              <Button
                variant="outline"
                onClick={goPrev}
                className="rounded-full border-[#B39152]/36 bg-[#FDF7F1] text-[#601D1C] hover:bg-[#B39152]/10"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>

              <Button
                onClick={goNext}
                className="rounded-full bg-[#141D46] text-[#FDF7F1] hover:bg-[#0E0D0E]"
              >
                Next page
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <div className="relative mx-auto flex justify-center [perspective:2400px]">
            <button
              type="button"
              onClick={goPrev}
              disabled={activePage === 0}
              aria-label="Previous page"
              className="absolute left-1 top-1/2 z-30 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-[#B39152]/45 bg-[#FDF7F1]/95 text-[#601D1C] shadow-[0_12px_30px_rgba(20,29,70,0.22)] backdrop-blur transition hover:border-[#B39152] hover:bg-[#B39152]/12 disabled:cursor-not-allowed disabled:opacity-30 sm:left-2 xl:left-8"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={activePage === pages.length - 1}
              aria-label="Next page"
              className="absolute right-1 top-1/2 z-30 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-[#B39152]/45 bg-[#FDF7F1]/95 text-[#601D1C] shadow-[0_12px_30px_rgba(20,29,70,0.22)] backdrop-blur transition hover:border-[#B39152] hover:bg-[#B39152]/12 disabled:cursor-not-allowed disabled:opacity-30 sm:right-2 xl:right-8"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
            <HTMLFlipBook
              key={isSpread ? "spread-book" : "single-book"}
              ref={bookRef}
              width={isSpread ? 560 : 370}
              height={isSpread ? 710 : 660}
              size="stretch"
              minWidth={300}
              maxWidth={isSpread ? 590 : 430}
              minHeight={520}
              maxHeight={760}
              startPage={0}
              drawShadow={!reduceMotion}
              flippingTime={reduceMotion ? 1 : 980}
              usePortrait={!isSpread}
              startZIndex={10}
              autoSize
              maxShadowOpacity={0.34}
              showCover
              mobileScrollSupport
              clickEventForward
              useMouseEvents={false}
              swipeDistance={28}
              showPageCorners={!reduceMotion}
              disableFlipByClick
              className="ftt-founder-book"
              style={{}}
              onFlip={(event: { data: number }) => setCurrentPage(event.data)}
            >
              {pages.map((page, index) => (
                <BookPage
                  key={page.id}
                  hard={page.kind === "cover" || page.kind === "back-cover"}
                  className={cn(
                    (page.kind === "cover" || page.kind === "back-cover") &&
                      "bg-[#141D46]",
                  )}
                >
                  <RenderedPage
                    onOpen={(event) => {
                      event.stopPropagation();
                      openFounderPages();
                    }}
                    page={page}
                    pageNumber={index + 1}
                    reduceMotion={reduceMotion}
                    totalPages={pages.length}
                  />
                </BookPage>
              ))}
            </HTMLFlipBook>
          </div>

          <div className="mt-5 flex justify-center">
            <div className="flex max-w-full gap-2 overflow-x-auto rounded-full border border-[#B39152]/24 bg-[#FFFCF8] p-2 shadow-[0_12px_34px_rgba(20,29,70,0.07)]">
              {pages.map((page, index) => (
                <button
                  key={`${page.id}-dot`}
                  type="button"
                  onClick={() => goToPage(index)}
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-semibold transition",
                    activePage === index
                      ? "border-[#141D46] bg-[#141D46] text-[#FDF7F1]"
                      : "border-[#B39152]/24 bg-[#FDF7F1] text-[#601D1C]/64 hover:border-[#B39152]",
                  )}
                  aria-label={`Go to ${getPageLabel(page)}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ContentsDialog({
  currentPage,
  onSelectPage,
  pages,
}: {
  currentPage: number;
  onSelectPage: (index: number) => void;
  pages: BookPageData[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="rounded-full border-[#B39152]/45 bg-[#FFFCF8] text-[#601D1C] hover:bg-[#B39152]/10"
        >
          <Menu className="h-4 w-4" />
          Contents
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] w-[calc(100%-2rem)] overflow-y-auto border-[#B39152]/28 bg-[#FDF7F1] text-[#141D46] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-3xl text-[#141D46]">
            Book contents
          </DialogTitle>
          <DialogDescription className="text-[#601D1C]/62">
            Jump to a founder or the final promise.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 grid gap-2">
          {pages.map((page, index) => (
            <button
              key={page.id}
              type="button"
              onClick={() => onSelectPage(index)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left transition",
                currentPage === index
                  ? "border-[#B39152] bg-[#141D46] text-[#FDF7F1]"
                  : "border-[#B39152]/22 bg-[#FFFCF8] text-[#601D1C]/72 hover:border-[#B39152]/60",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
                Page {index + 1}
              </span>
              <span className="mt-1 block font-serif text-xl">
                {getPageLabel(page)}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RenderedPage({
  page,
  pageNumber,
  totalPages,
  reduceMotion,
  onOpen,
}: {
  page: BookPageData;
  pageNumber: number;
  totalPages: number;
  reduceMotion: boolean;
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  if (page.kind === "cover") {
    return <CoverPage onOpen={onOpen} reduceMotion={reduceMotion} />;
  }

  if (page.kind === "founder-image" && page.founder) {
    return (
      <FounderImagePage
        founder={page.founder}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />
    );
  }

  if (page.kind === "founder-story" && page.founder) {
    return (
      <FounderStoryPage
        founder={page.founder}
        pageNumber={pageNumber}
        reduceMotion={reduceMotion}
        totalPages={totalPages}
      />
    );
  }

  if (page.kind === "founder-mobile" && page.founder) {
    return (
      <FounderMobilePage
        founder={page.founder}
        pageNumber={pageNumber}
        reduceMotion={reduceMotion}
        totalPages={totalPages}
      />
    );
  }

  return <BackCoverPage />;
}

function CoverPage({
  onOpen,
  reduceMotion,
}: {
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
  reduceMotion: boolean;
}) {
  return (
    <div className="relative h-full overflow-hidden bg-[#141D46] p-[9%] text-[#FDF7F1]">
      {/* CoverPage artwork as the book-cover background. */}
      <Image
        src="/CoverPage.svg"
        alt=""
        fill
        priority
        unoptimized
        sizes="(max-width: 1024px) 100vw, 50vw"
        className="object-cover"
      />
      {/* Soft dark scrim so the gold + ivory cover text stays legible. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,13,14,0.66)_0%,rgba(20,29,70,0.32)_46%,rgba(14,13,14,0.58)_100%)]" />

      <div className="relative z-10 flex h-full flex-col justify-between gap-4">
        <motion.div
          initial="hidden"
          animate="show"
          custom={reduceMotion}
          variants={rowStagger}
          className="pt-2"
        >
          <motion.div custom={reduceMotion} variants={pageEnter}>
            <Badge className="rounded-full border border-[#B39152]/35 bg-[#FDF7F1]/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.24em] text-[#B39152] hover:bg-[#FDF7F1]/10">
              FTT · The people behind the trunk
            </Badge>
          </motion.div>

          <motion.h2
            custom={reduceMotion}
            variants={pageEnter}
            className="mt-5 max-w-[12ch] font-serif text-[clamp(2.65rem,7vw,5.1rem)] font-medium leading-[0.88] text-[#FDF7F1]"
          >
            Every saree deserves a second story.
          </motion.h2>

          <motion.p
            custom={reduceMotion}
            variants={pageEnter}
            className="mt-5 max-w-md text-[clamp(0.88rem,1.2vw,1rem)] leading-6 text-[#FDF7F1]/74"
          >
            From the Trunk began with a simple belief: the sarees folded away in
            homes still carry memory, craft, and emotion. They are not finished.
            They are waiting for their next chapter.
          </motion.p>

          <motion.p
            custom={reduceMotion}
            variants={pageEnter}
            className="mt-6 max-w-xs rounded-full border border-[#B39152]/30 bg-[#FDF7F1]/8 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-[#B39152]"
          >
            Honour · Preserve · Re-story
          </motion.p>
        </motion.div>

        <button
          type="button"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onOpen}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          className="ftt-cover-glow-button group relative z-20 mt-3 max-w-[13rem] self-end rounded-[1.25rem] border border-[#B39152]/55 bg-[#FDF7F1]/92 p-3 text-left text-[#141D46] shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur transition hover:-translate-y-1"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
            Begin here
          </span>
          <span className="mt-1.5 block font-serif text-[clamp(1.18rem,3vw,1.45rem)] leading-tight">
            Meet our founders.
          </span>
          <span className="mt-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#601D1C]">
            Open book
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </button>
      </div>
    </div>
  );
}

function FounderImagePage({
  founder,
  pageNumber,
  totalPages,
}: {
  founder: Founder;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <div className="relative h-full bg-[#FFFCF8] p-6">
      <PageChrome pageNumber={pageNumber} totalPages={totalPages} />

      <div className="relative h-full overflow-hidden rounded-[1.4rem] border border-[#B39152]/24 bg-[#601D1C]/10 p-4">
        <div className="relative h-full overflow-hidden rounded-[1.1rem] bg-[#0E0D0E]">
          <Image
            src={founder.image}
            alt={founder.name}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-[#0E0D0E]/78 via-[#0E0D0E]/10 to-transparent" />

          <div className="absolute bottom-5 left-5 right-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#B39152]">
              Founder
            </p>
            <h2 className="mt-2 font-serif text-[clamp(2.35rem,4vw,4rem)] leading-none text-[#FDF7F1]">
              {founder.name}
            </h2>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#FDF7F1]/70">
              {founder.designation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FounderStoryPage({
  founder,
  pageNumber,
  totalPages,
  reduceMotion,
}: {
  founder: Founder;
  pageNumber: number;
  totalPages: number;
  reduceMotion: boolean;
}) {
  return (
    <div className="relative h-full bg-[#FFFCF8] p-6">
      <PageChrome pageNumber={pageNumber} totalPages={totalPages} />

      <motion.div
        initial="hidden"
        animate="show"
        custom={reduceMotion}
        variants={rowStagger}
        className="relative flex h-full flex-col overflow-y-auto rounded-[1.4rem] border border-[#B39152]/24 bg-[#FDF7F1] p-6"
      >
        <motion.div custom={reduceMotion} variants={pageEnter}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#B39152]">
            Founder story
          </p>
          <h2 className="mt-4 font-serif text-[clamp(2.15rem,4.4vw,4.15rem)] leading-[0.92] text-[#141D46]">
            {founder.storyHeading}
          </h2>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#601D1C]/62">
            {founder.designation}
          </p>
        </motion.div>

        <motion.div
          custom={reduceMotion}
          variants={pageEnter}
          className="mt-6 space-y-4"
        >
          {founder.about.map((paragraph) => (
            <p
              key={paragraph}
              className="text-[clamp(0.9rem,1.25vw,1.02rem)] leading-7 text-[#601D1C]/74"
            >
              {paragraph}
            </p>
          ))}
        </motion.div>

        <motion.div
          custom={reduceMotion}
          variants={pageEnter}
          className="mt-6 rounded-[1.25rem] border border-[#B39152]/28 bg-[#B39152]/10 p-5"
        >
          <h3 className="font-serif text-[clamp(1.8rem,3vw,2.7rem)] leading-tight text-[#141D46]">
            Why From the Trunk
          </h3>
          <div className="mt-3 space-y-3">
            {founder.whyFTT.map((paragraph) => (
              <p
                key={paragraph}
                className="text-[clamp(0.85rem,1.1vw,0.98rem)] leading-7 text-[#601D1C]/74"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </motion.div>

      </motion.div>
    </div>
  );
}

function FounderMobilePage({
  founder,
  pageNumber,
  totalPages,
  reduceMotion,
}: {
  founder: Founder;
  pageNumber: number;
  totalPages: number;
  reduceMotion: boolean;
}) {
  return (
    <div className="relative h-full bg-[#FFFCF8] p-5">
      <PageChrome pageNumber={pageNumber} totalPages={totalPages} />

      <motion.div
        initial="hidden"
        animate="show"
        custom={reduceMotion}
        variants={rowStagger}
        className="relative h-full overflow-y-auto rounded-[1.35rem] border border-[#B39152]/24 bg-[#FDF7F1] p-5"
      >
        <motion.div
          custom={reduceMotion}
          variants={pageEnter}
          className="flex items-center gap-4"
        >
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[#B39152]/45 bg-[#601D1C]/10">
            <Image
              src={founder.image}
              alt={founder.name}
              fill
              sizes="80px"
              className="object-cover"
            />
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#B39152]">
              Founder
            </p>
            <h2 className="mt-1 font-serif text-[clamp(1.85rem,7vw,3.15rem)] leading-none text-[#141D46]">
              {founder.name}
            </h2>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#601D1C]/60">
              {founder.designation}
            </p>
          </div>
        </motion.div>

        <motion.div
          custom={reduceMotion}
          variants={pageEnter}
          className="mt-6 space-y-4"
        >
          {founder.about.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-7 text-[#601D1C]/74">
              {paragraph}
            </p>
          ))}
        </motion.div>

        <motion.div
          custom={reduceMotion}
          variants={pageEnter}
          className="mt-6 rounded-[1.25rem] border border-[#B39152]/28 bg-[#B39152]/10 p-5"
        >
          <h3 className="font-serif text-3xl leading-tight text-[#141D46]">
            Why From the Trunk
          </h3>
          <div className="mt-3 space-y-3">
            {founder.whyFTT.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-7 text-[#601D1C]/74">
                {paragraph}
              </p>
            ))}
          </div>
        </motion.div>

      </motion.div>
    </div>
  );
}

function BackCoverPage() {
  return (
    <div
      className="relative h-full overflow-hidden bg-[#141D46] p-6 text-[#FDF7F1]"
      style={{
        background:
          "radial-gradient(circle at 78% 20%, rgba(179,145,82,.18), transparent 25%), linear-gradient(135deg, #141D46 0%, #10183B 62%, #601D1C 150%)",
      }}
    >
      <div className="absolute inset-5 rounded-[1.35rem] border border-[#B39152]/18" />

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <Badge className="rounded-full border border-[#B39152]/35 bg-[#FDF7F1]/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.24em] text-[#B39152] hover:bg-[#FDF7F1]/10">
            The FTT promise
          </Badge>
          <h2 className="mt-8 font-serif text-[clamp(3rem,8vw,6.6rem)] leading-[0.86] text-[#FDF7F1]">
            Not pre-owned. Re-storied.
          </h2>
          <p className="mt-7 max-w-md text-sm leading-7 text-[#FDF7F1]/74">
            We honour the sarees, preserve their stories, and help them be
            loved all over again.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            asChild
            className="rounded-full bg-[#B39152] text-[#0E0D0E] hover:bg-[#C8A45F]"
          >
            <Link href="/collection">
              <BookOpen className="h-4 w-4" />
              Find your saree
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="rounded-full border-[#FDF7F1]/35 bg-transparent text-[#FDF7F1] hover:bg-[#FDF7F1]/10 hover:text-[#FDF7F1]"
          >
            <Link href="mailto:hello@fromthetrunk.shop?subject=I want to open my trunk">
              <Sparkles className="h-4 w-4" />
              Open your trunk
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function PageChrome({
  pageNumber,
  totalPages,
}: {
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(14,13,14,.035),transparent_8%,transparent_92%,rgba(14,13,14,.05))]" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-5 bg-linear-to-t from-[#B39152]/14 to-transparent" />
      <div className="absolute bottom-3 right-5 z-20 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#601D1C]/38">
        {pageNumber}/{totalPages}
      </div>
    </>
  );
}

function useBookSpreadMode() {
  const [isSpread, setIsSpread] = useState(false);

  useEffect(() => {
    const query =
      "(min-width: 980px), (min-width: 768px) and (orientation: landscape)";
    const media = window.matchMedia(query);

    const sync = () => {
      setIsSpread(media.matches);
    };

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isSpread;
}

function getPageLabel(page: BookPageData) {
  if (page.kind === "cover") return "Cover";
  if (page.kind === "back-cover") return "The FTT Promise";
  if (page.kind === "founder-image" && page.founder) {
    return `${page.founder.name} portrait`;
  }
  if (page.founder) return page.founder.name;
  return "Page";
}
