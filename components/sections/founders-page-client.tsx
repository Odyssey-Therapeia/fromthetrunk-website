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
      "Dr. Meena is an American Board Certified Psychiatrist specialising in Child, Adolescent and Adult Psychiatry, trained in the US and now rooted back in India. But alongside her clinical world lives a quieter, deeply personal one: a lifelong love for sarees.",
      "For Meena, the problem was never finding a saree she loved. It was finding a reason not to buy another one.",
    ],
    whyFTT: [
      "As someone passionate about sustainability, she sat with an uncomfortable truth: every new saree bought means resources spent, fabric produced, and often, another saree left unworn. She wanted a way to keep wearing and celebrating sarees without the weight of that cycle.",
      "From the Trunk became her answer: a space where beautiful sarees find new homes, new stories, and new lives, without anything going to waste.",
    ],
  },
  {
    id: "grace",
    name: "Grace Priscilla",
    designation: "COO & Co-Founder",
    image: "/founder/grace-founder.jpg",
    storyHeading: "A trunk full of unfinished stories",
    about: [
      "Grace is a psychologist by training, but fashion and sustainability have always lived rent-free in her mind. When the world started talking about sustainable fashion, she listened, and then she looked closer to home.",
      "The moment that changed everything happened on a family vacation. Tucked in her grandmother's room was an old trunk. Inside it, folded carefully and quietly forgotten, were sarees, dozens of them. Each one carrying a memory: a wedding, a festival, an ordinary Tuesday that had somehow mattered. None of them worn in years. None of them ready to be thrown away.",
    ],
    whyFTT: [
      "Grace couldn't stop thinking about it. Every household in India has that trunk. Every trunk holds those sarees. And every saree in it deserves to be worn again, not locked away, not discarded, but passed on.",
      "That is the idea From the Trunk is built on. Not just sustainable fashion, something more personal: the belief that a saree's story should never end with the person who first wore it.",
    ],
  },
  {
    id: "abraham",
    name: "Abraham Abel Bodala",
    designation: "CTO & Co-Founder",
    image: "/founder/abraham-founder.png",
    storyHeading: "Building trust for circular fashion",
    about: [
      "Abraham understood the idea the moment he heard it, and set out to build the technology that makes it real.",
      "He shapes the platform behind From the Trunk: discovery, trust, secure checkout, and the account experience, engineered so every part of the journey feels as considered as the sarees it carries.",
    ],
    whyFTT: [
      "Abraham builds for From the Trunk because circular fashion needs more than sentiment. It needs systems that make trust easy. Authentication, product detail, checkout, and account care all have to work with calm precision.",
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
    if (!isSpread) {
      setCurrentPage((page) => Math.min(page + 1, pages.length - 1));
      return;
    }
    bookRef.current?.pageFlip().flipNext("bottom");
  };

  const goPrev = () => {
    if (!isSpread) {
      setCurrentPage((page) => Math.max(page - 1, 0));
      return;
    }
    bookRef.current?.pageFlip().flipPrev("bottom");
  };

  const goToPage = (index: number) => {
    if (!isSpread) {
      setCurrentPage(Math.min(Math.max(index, 0), pages.length - 1));
      return;
    }
    bookRef.current?.pageFlip().flip(index, "bottom");
  };

  const openFounderPages = () => {
    if (!isSpread) {
      setCurrentPage(1);
      return;
    }
    bookRef.current?.pageFlip().flip(1, "bottom");
  };

  const activePage = Math.min(currentPage, pages.length - 1);
  const bookSize = useFounderBookSize(isSpread);

  return (
    <main className="overflow-hidden bg-[#FDF7F1] text-[#0E0D0E]">
      {isSpread ? (
        <section className="relative px-2 py-2 sm:px-4 lg:px-5">
          <div className="mx-auto grid h-[calc(100svh-8.75rem)] min-h-[34rem] max-h-[48rem] max-w-[96rem] grid-cols-[minmax(12rem,20%)_minmax(0,1fr)] gap-2 overflow-hidden rounded-[1.8rem] bg-[#FDF7F1] shadow-[0_24px_80px_rgba(20,29,70,0.10)]">
            <FounderDesktopSpine
              currentPage={activePage}
              goToPage={goToPage}
              pages={pages}
            />

            <div className="relative min-w-0 overflow-hidden rounded-[1.65rem] border border-[#B39152]/16 bg-[#FFFCF8]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_22%,rgba(179,145,82,0.10),transparent_30%),radial-gradient(circle_at_18%_90%,rgba(20,29,70,0.075),transparent_34%)]" />

              <FounderBookControls
                activePage={activePage}
                goNext={goNext}
                goPrev={goPrev}
                totalPages={pages.length}
              />

              <div className="relative flex h-full min-h-0 items-center justify-center px-6 py-3 pr-16 xl:px-10 xl:py-4 xl:pr-20">
                <div className="relative flex min-h-0 w-full flex-1 items-center justify-center [perspective:2400px]">

                  <HTMLFlipBook
                    key="spread-book"
                    ref={bookRef}
                    width={bookSize.pageWidth}
                    height={bookSize.pageHeight}
                    size="stretch"
                    minWidth={bookSize.pageWidth}
                    maxWidth={bookSize.pageWidth}
                    minHeight={bookSize.pageHeight}
                    maxHeight={bookSize.pageHeight}
                    startPage={0}
                    drawShadow={!reduceMotion}
                    flippingTime={reduceMotion ? 1 : 980}
                    usePortrait={false}
                    startZIndex={10}
                    autoSize
                    maxShadowOpacity={0.34}
                    showCover
                    mobileScrollSupport
                    clickEventForward
                    useMouseEvents
                    swipeDistance={28}
                    showPageCorners={!reduceMotion}
                    disableFlipByClick={false}
                    className="ftt-founder-book cursor-grab active:cursor-grabbing"
                    style={{}}
                    onFlip={(event: { data: number }) =>
                      setCurrentPage(event.data)
                    }
                  >
                    {pages.map((page, index) => (
                      <BookPage
                        key={page.id}
                        hard={
                          page.kind === "cover" || page.kind === "back-cover"
                        }
                        className={cn(
                          (page.kind === "cover" ||
                            page.kind === "back-cover") &&
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
              </div>
            </div>
          </div>
        </section>
      ) : (
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
              <MobileReadablePage
                onOpen={openFounderPages}
                page={pages[activePage]}
                pageNumber={activePage + 1}
                reduceMotion={reduceMotion}
                totalPages={pages.length}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:mx-auto sm:max-w-md">
              <Button
                type="button"
                variant="outline"
                onClick={goPrev}
                disabled={activePage === 0}
                className="h-12 rounded-full border-[#B39152]/36 bg-[#FDF7F1] text-[#601D1C] hover:bg-[#B39152]/10"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                onClick={goNext}
                disabled={activePage === pages.length - 1}
                className="h-12 rounded-full bg-[#141D46] text-[#FDF7F1] hover:bg-[#0E0D0E]"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
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
      )}
    </main>
  );
}

function FounderDesktopSpine({
  currentPage,
  goToPage,
  pages,
}: {
  currentPage: number;
  goToPage: (index: number) => void;
  pages: BookPageData[];
}) {
  return (
    <aside className="relative hidden min-h-0 overflow-hidden rounded-[1.65rem] bg-[linear-gradient(160deg,#601D1C_0%,#141D46_68%,#10183B_100%)] text-[#FDF7F1] shadow-[0_20px_64px_rgba(20,29,70,0.22)] lg:block">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(179,145,82,0.22),transparent_24%),radial-gradient(circle_at_90%_90%,rgba(96,29,28,0.25),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[#B39152]/42" />

      <div className="relative z-10 flex h-full flex-col justify-between p-4 xl:p-5">
        <div className="flex justify-end">
          <ContentsDialog
            currentPage={currentPage}
            onSelectPage={goToPage}
            pages={pages}
            triggerVariant="icon"
          />
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center py-5">
          <div className="flex items-center justify-center gap-5 xl:gap-7">
            <h1
              className="font-serif text-[clamp(1.4rem,min(5.2vw,4.7vh),6.35rem)] font-medium leading-[0.82] tracking-[-0.055em] text-[#FDF7F1]"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              OUR FOUNDERS
            </h1>

            <p
              className="max-h-[28rem] text-[clamp(0.72rem,0.9vw,0.95rem)] font-semibold leading-6 tracking-[0.02em] text-[#FDF7F1]/76"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              A book-like introduction to the people helping FTT give sarees
              their next life.
            </p>
          </div>
        </div>

        <div className="h-8" aria-hidden="true" />
      </div>
    </aside>
  );
}

function FounderBookControls({
  activePage,
  goNext,
  goPrev,
  totalPages,
}: {
  activePage: number;
  goNext: () => void;
  goPrev: () => void;
  totalPages: number;
}) {
  return (
    <div className="absolute right-4 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-3 xl:right-6">
      <button
        type="button"
        onClick={goPrev}
        disabled={activePage === 0}
        aria-label="Previous founder page"
        className="grid h-11 w-11 place-items-center rounded-full border border-[#B39152]/40 bg-[#141D46] text-[#FDF7F1] shadow-[0_14px_34px_rgba(20,29,70,0.18)] backdrop-blur transition hover:border-[#B39152] hover:bg-[#10183B] disabled:cursor-not-allowed disabled:bg-[#FDF7F1]/88 disabled:text-[#141D46]/30 disabled:opacity-70"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={goNext}
        disabled={activePage === totalPages - 1}
        aria-label="Next founder page"
        className="grid h-11 w-11 place-items-center rounded-full border border-[#B39152]/40 bg-[#141D46] text-[#FDF7F1] shadow-[0_14px_34px_rgba(20,29,70,0.18)] backdrop-blur transition hover:border-[#B39152] hover:bg-[#10183B] disabled:cursor-not-allowed disabled:bg-[#FDF7F1]/88 disabled:text-[#141D46]/30 disabled:opacity-70"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function MobileReadablePage({
  page,
  pageNumber,
  totalPages,
  reduceMotion,
  onOpen,
}: {
  page?: BookPageData;
  pageNumber: number;
  totalPages: number;
  reduceMotion: boolean;
  onOpen: () => void;
}) {
  if (!page) return null;

  if (page.kind === "cover") {
    return (
      <motion.article
        initial="hidden"
        animate="show"
        custom={reduceMotion}
        variants={rowStagger}
        className="relative w-full overflow-hidden rounded-[1.5rem] border border-[#B39152]/22 bg-[#141D46] p-5 text-[#FDF7F1] shadow-[0_22px_70px_rgba(20,29,70,0.18)] sm:max-w-2xl sm:p-8"
      >
        <Image
          src="/CoverPage.svg"
          alt=""
          fill
          priority
          unoptimized
          sizes="(max-width: 1024px) 100vw, 640px"
          className="object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,13,14,0.7)_0%,rgba(20,29,70,0.5)_50%,rgba(14,13,14,0.72)_100%)]" />
        <div className="relative z-10">
          <motion.div custom={reduceMotion} variants={pageEnter}>
            <Badge className="rounded-full border border-[#B39152]/35 bg-[#FDF7F1]/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.22em] text-[#B39152] hover:bg-[#FDF7F1]/10">
              FTT · The people behind the trunk
            </Badge>
          </motion.div>
          <motion.h2
            custom={reduceMotion}
            variants={pageEnter}
            className="mt-8 max-w-[11ch] font-serif text-[clamp(3rem,15vw,5rem)] leading-[0.88]"
          >
            The minds behind the trunk.
          </motion.h2>
          <motion.p
            custom={reduceMotion}
            variants={pageEnter}
            className="mt-5 max-w-md text-sm leading-7 text-[#FDF7F1]/76"
          >
            From the Trunk is a small team with a quiet obsession: beautiful
            sarees, given another life. We find them, restore them by hand, and
            pass their stories on. Open the book to meet us.
          </motion.p>
          <motion.div custom={reduceMotion} variants={pageEnter}>
            <Button
              type="button"
              onClick={onOpen}
              className="mt-8 h-12 w-full rounded-full bg-[#B39152] text-[#0E0D0E] hover:bg-[#C8A45F] sm:w-auto"
            >
              Meet our founders
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
        <MobilePageCount pageNumber={pageNumber} totalPages={totalPages} />
      </motion.article>
    );
  }

  if (page.kind === "back-cover") {
    return (
      <article className="relative w-full overflow-hidden rounded-[1.5rem] border border-[#B39152]/22 bg-[#141D46] p-5 text-[#FDF7F1] shadow-[0_22px_70px_rgba(20,29,70,0.18)] sm:max-w-2xl sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(179,145,82,0.18),transparent_28%),linear-gradient(135deg,#141D46_0%,#10183B_62%,#601D1C_150%)]" />
        <div className="relative z-10">
          <Badge className="rounded-full border border-[#B39152]/35 bg-[#FDF7F1]/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.24em] text-[#B39152] hover:bg-[#FDF7F1]/10">
            The FTT promise
          </Badge>
          <h2 className="mt-8 font-serif text-[clamp(3rem,15vw,5.5rem)] leading-[0.86]">
            Authenticated. Restored. Remembered.
          </h2>
          <p className="mt-6 max-w-md text-sm leading-7 text-[#FDF7F1]/76">
            Every saree is authenticated, restored by hand, and given a story
            card of its own: proof of where it&apos;s been, and a start to where
            it&apos;s going.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Button
              asChild
              className="h-12 rounded-full bg-[#B39152] text-[#0E0D0E] hover:bg-[#C8A45F]"
            >
              <Link href="/collection">
                <BookOpen className="h-4 w-4" />
                Find your saree
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-full border-[#FDF7F1]/35 bg-transparent text-[#FDF7F1] hover:bg-[#FDF7F1]/10 hover:text-[#FDF7F1]"
            >
              <Link href="/collection">
                <Sparkles className="h-4 w-4" />
                Open your trunk
              </Link>
            </Button>
          </div>
        </div>
        <MobilePageCount pageNumber={pageNumber} totalPages={totalPages} />
      </article>
    );
  }

  if (!page.founder) return null;

  return (
    <motion.article
      initial="hidden"
      animate="show"
      custom={reduceMotion}
      variants={rowStagger}
      className="w-full rounded-[1.5rem] border border-[#B39152]/22 bg-[#FFFCF8] p-4 shadow-[0_22px_70px_rgba(20,29,70,0.12)] sm:max-w-2xl sm:p-6"
    >
      <div className="rounded-[1.25rem] border border-[#B39152]/22 bg-[#FDF7F1] p-4 sm:p-6">
        <motion.div
          custom={reduceMotion}
          variants={pageEnter}
          className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center"
        >
          <div className="relative h-24 w-24 overflow-hidden rounded-full border border-[#B39152]/45 bg-[#601D1C]/10 sm:h-28 sm:w-28">
            <Image
              src={page.founder.image}
              alt={page.founder.name}
              fill
              sizes="112px"
              className="object-cover"
            />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#B39152]">
              Founder
            </p>
            <h2 className="mt-2 font-serif text-[clamp(2.35rem,12vw,4rem)] leading-[0.9] text-[#141D46]">
              {page.founder.name}
            </h2>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#601D1C]/60">
              {page.founder.designation}
            </p>
          </div>
        </motion.div>

        <motion.div
          custom={reduceMotion}
          variants={pageEnter}
          className="mt-6 space-y-4"
        >
          {page.founder.about.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-7 text-[#601D1C]/74">
              {paragraph}
            </p>
          ))}
        </motion.div>

        <motion.div
          custom={reduceMotion}
          variants={pageEnter}
          className="mt-6 rounded-[1.2rem] border border-[#B39152]/28 bg-[#B39152]/10 p-4 sm:p-5"
        >
          <h3 className="font-serif text-3xl leading-tight text-[#141D46]">
            Why From the Trunk
          </h3>
          <div className="mt-3 space-y-3">
            {page.founder.whyFTT.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-7 text-[#601D1C]/74">
                {paragraph}
              </p>
            ))}
          </div>
        </motion.div>
      </div>
      <MobilePageCount pageNumber={pageNumber} totalPages={totalPages} />
    </motion.article>
  );
}

function MobilePageCount({
  pageNumber,
  totalPages,
}: {
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <p className="relative z-10 mt-4 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#601D1C]/42">
      {pageNumber}/{totalPages}
    </p>
  );
}

function ContentsDialog({
  currentPage,
  onSelectPage,
  pages,
  triggerVariant = "pill",
}: {
  currentPage: number;
  onSelectPage: (index: number) => void;
  pages: BookPageData[];
  triggerVariant?: "pill" | "icon";
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {triggerVariant === "icon" ? (
          <button
            type="button"
            aria-label="Open book contents"
            className="grid h-11 w-11 place-items-center rounded-full border border-[#B39152]/45 bg-[#B39152]/90 text-[#FDF7F1] shadow-[0_14px_34px_rgba(14,13,14,0.18)] transition hover:bg-[#C8A45F] hover:text-[#0E0D0E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDF7F1]/70"
          >
            <Menu className="h-6 w-6" />
          </button>
        ) : (
          <Button
            variant="outline"
            className="rounded-full border-[#B39152]/45 bg-[#FFFCF8] text-[#601D1C] hover:bg-[#B39152]/10"
          >
            <Menu className="h-4 w-4" />
            Contents
          </Button>
        )}
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
  // The "Begin here — Meet our founders" open-book button below is commented
  // out per request; keep `onOpen` referenced so restoring it is a one-line
  // uncomment (and to satisfy no-unused-vars).
  void onOpen;

  return (
    <div className="relative h-full overflow-hidden bg-[#141D46] p-[7%] text-[#FDF7F1]">
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
            className="mt-4 max-w-[12ch] font-serif text-[clamp(2.2rem,5.8vw,4.15rem)] font-medium leading-[0.9] text-[#FDF7F1]"
          >
            The minds behind the trunk.
          </motion.h2>

          <motion.p
            custom={reduceMotion}
            variants={pageEnter}
            className="mt-4 max-w-md text-[clamp(0.76rem,0.95vw,0.9rem)] leading-6 text-[#FDF7F1]/78"
          >
            From the Trunk is a small team with a quiet obsession: beautiful
            sarees, given another life. We find them, restore them by hand, and
            pass their stories on. Open the book to meet us.
          </motion.p>

          <motion.p
            custom={reduceMotion}
            variants={pageEnter}
            className="mt-4 max-w-xs rounded-full border border-[#B39152]/30 bg-[#FDF7F1]/8 px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-[#B39152]"
          >
            Honour · Preserve · Re-stored
          </motion.p>
        </motion.div>

        {/* "Begin here — Meet our founders" open-book CTA — commented out per request.
        <button
          type="button"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onOpen}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          className="ftt-cover-glow-button group absolute bottom-20 left-5 z-20 hidden max-w-[12rem] rounded-[1.1rem] border border-[#B39152]/55 bg-[#FDF7F1]/92 p-3 text-left text-[#141D46] shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur transition hover:-translate-y-1 xl:block"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
            Begin here
          </span>
          <span className="mt-1.5 block font-serif text-[clamp(1.05rem,2.4vw,1.32rem)] leading-tight">
            Meet our founders.
          </span>
          <span className="mt-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#601D1C]">
            Open book
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </button>
        */}
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
    <div className="relative h-full bg-[#FFFCF8] p-4 lg:p-5">
      <PageChrome pageNumber={pageNumber} totalPages={totalPages} />

      <div className="relative h-full overflow-hidden rounded-[1.25rem] border border-[#B39152]/24 bg-[#601D1C]/10 p-3 lg:p-4">
        <div className="relative h-full overflow-hidden rounded-[1.1rem] bg-[#0E0D0E]">
          <Image
            src={founder.image}
            alt={founder.name}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-[#0E0D0E]/78 via-[#0E0D0E]/10 to-transparent" />

          <div className="absolute bottom-4 left-4 right-4 lg:bottom-5 lg:left-5 lg:right-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#B39152]">
              Founder
            </p>
            <h2 className="mt-2 font-serif text-[clamp(1.8rem,3.2vw,3.35rem)] leading-none text-[#FDF7F1]">
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
    <div className="relative h-full bg-[#FFFCF8] p-4 lg:p-5">
      <PageChrome pageNumber={pageNumber} totalPages={totalPages} />

      <motion.div
        initial="hidden"
        animate="show"
        custom={reduceMotion}
        variants={rowStagger}
        className="relative flex h-full flex-col overflow-y-auto overscroll-contain rounded-[1.25rem] border border-[#B39152]/24 bg-[#FDF7F1] p-4 [scrollbar-width:thin] lg:p-5"
      >
        <motion.div custom={reduceMotion} variants={pageEnter}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#B39152]">
            Founder story
          </p>
          <h2 className="mt-3 font-serif text-[clamp(1.5rem,2.6vw,2.75rem)] leading-[0.96] text-[#141D46]">
            {founder.storyHeading}
          </h2>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#601D1C]/62">
            {founder.designation}
          </p>
        </motion.div>

        <motion.div
          custom={reduceMotion}
          variants={pageEnter}
          className="mt-4 space-y-3"
        >
          {founder.about.map((paragraph) => (
            <p
              key={paragraph}
              className="text-[clamp(0.72rem,0.82vw,0.88rem)] leading-[1.65] text-[#601D1C]/74"
            >
              {paragraph}
            </p>
          ))}
        </motion.div>

        <motion.div
          custom={reduceMotion}
          variants={pageEnter}
          className="mt-4 rounded-[1.1rem] border border-[#B39152]/28 bg-[#B39152]/10 p-4"
        >
          <h3 className="font-serif text-[clamp(1.35rem,2vw,2.05rem)] leading-tight text-[#141D46]">
            Why From the Trunk
          </h3>
          <div className="mt-2.5 space-y-2.5">
            {founder.whyFTT.map((paragraph) => (
              <p
                key={paragraph}
                className="text-[clamp(0.7rem,0.8vw,0.84rem)] leading-[1.65] text-[#601D1C]/74"
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
      className="relative h-full overflow-hidden bg-[#141D46] p-5 text-[#FDF7F1]"
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
          <h2 className="mt-6 font-serif text-[clamp(2.2rem,5.6vw,4.4rem)] leading-[0.9] text-[#FDF7F1]">
            Authenticated. Restored. Remembered.
          </h2>
          <p className="mt-5 max-w-md text-[clamp(0.76rem,0.96vw,0.9rem)] leading-6 text-[#FDF7F1]/78">
            Every saree is authenticated, restored by hand, and given a story
            card of its own: proof of where it&apos;s been, and a start to where
            it&apos;s going.
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
            <Link href="/collection">
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

function useFounderBookSize(enabled: boolean) {
  const [size, setSize] = useState({
    pageWidth: 470,
    pageHeight: 595,
  });

  useEffect(() => {
    if (!enabled) return;

    const sync = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      const reservedHeaderHeight = width >= 1280 ? 142 : 132;
      const availableHeight = Math.max(500, height - reservedHeaderHeight);
      const availableRightWidth = Math.max(640, width * 0.72);

      const maxHeightByViewport = availableHeight * 0.9;
      const maxHeightByWidth = availableRightWidth / 2 / 0.79;

      const pageHeight = Math.round(
        clampNumber(Math.min(maxHeightByViewport, maxHeightByWidth), 500, 690),
      );
      const pageWidth = Math.round(pageHeight * 0.79);

      setSize({
        pageWidth,
        pageHeight,
      });
    };

    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [enabled]);

  return size;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
