"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Gem,
  HandHeart,
  Leaf,
  PackageOpen,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { ConnectDialog } from "@/components/layout/connect-dialog";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Step = {
  title: string;
  description: string;
};

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  steps: Step[];
};

const STEP_ICONS: LucideIcon[] = [
  HandHeart,
  ScanSearch,
  Leaf,
  PackageOpen,
  Truck,
];

const STEP_NOTES = [
  "Private wardrobes, family trunks, heirloom pieces.",
  "Fabric, zari, borders, pallu, age, and condition.",
  "Gentle cleaning, steaming, repair, and textile respect.",
  "Tissue wrap, care note, Thank you card.",
  "Tracked dispatch, careful handling.",
];

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    title: "Authenticated",
    description: "Every piece is reviewed before it enters the collection.",
  },
  {
    icon: BadgeCheck,
    title: "Condition graded",
    description: "Marks, fabric strength, zari, and restoration needs are documented.",
  },
  {
    icon: Sparkles,
    title: "Re-stored",
    description: "We preserve the textile without erasing the life it has already lived.",
  },
];

const fadeUp: Variants = {
  hidden: {
    opacity: 0,
    y: 26,
    filter: "blur(8px)",
  },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.72,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const stagger: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.08,
    },
  },
};

export function HowItWorksExperience({
  eyebrow,
  title,
  description,
  steps,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [connectOpen, setConnectOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLElement | null>(null);
  const threadFillRef = useRef<HTMLDivElement | null>(null);
  const beadRef = useRef<HTMLDivElement | null>(null);

  useIsoLayoutEffect(() => {
    if (!rootRef.current) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap
          .timeline({
            scrollTrigger: {
              trigger: timelineRef.current,
              start: "top 66%",
              end: "bottom 82%",
              scrub: 0.7,
            },
          })
          .fromTo(
            threadFillRef.current,
            { scaleY: 0 },
            { scaleY: 1, ease: "none" },
            0,
          )
          .fromTo(
            beadRef.current,
            { top: "0%", autoAlpha: 1 },
            { top: "100%", ease: "none" },
            0,
          );

        const stations = gsap.utils.toArray<HTMLElement>(".ftt-hiw-station");

        stations.forEach((station) => {
          ScrollTrigger.create({
            trigger: station,
            start: "top 58%",
            end: "bottom 44%",
            onToggle: (self) => {
              station.classList.toggle("is-active", self.isActive);
            },
          });
        });

        gsap.to(".ftt-hiw-orbit", {
          rotate: 360,
          duration: 34,
          repeat: -1,
          ease: "none",
        });

        gsap.to(".ftt-hiw-glow", {
          scale: 1.08,
          opacity: 0.32,
          duration: 3.4,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });

        requestAnimationFrame(() => ScrollTrigger.refresh());
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(threadFillRef.current, { scaleY: 1 });
        gsap.set(beadRef.current, { autoAlpha: 0 });

        gsap.utils
          .toArray<HTMLElement>(".ftt-hiw-station")
          .forEach((station) => station.classList.add("is-active"));
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  const titleWords = title.split(" ");

  const titleContainer: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.075,
        delayChildren: 0.08,
      },
    },
  };

  const titleWord: Variants = {
    hidden: {
      y: reduceMotion ? 0 : "115%",
      opacity: reduceMotion ? 1 : 0,
    },
    show: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.75,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  return (
    <main ref={rootRef} className="ftt-hiw relative isolate overflow-hidden">
      <style>{CSS}</style>

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#FDF7F1]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(179,145,82,0.20),transparent_32%),radial-gradient(circle_at_86%_10%,rgba(20,29,70,0.13),transparent_35%),linear-gradient(180deg,#FDF7F1_0%,#F7EDE3_100%)]" />
        <div className="absolute left-0 top-0 h-[28rem] w-[28rem] rounded-full bg-[#B39152]/10 blur-3xl" />
        <div className="absolute bottom-16 right-0 h-[30rem] w-[30rem] rounded-full bg-[#141D46]/10 blur-3xl" />
      </div>

      <section className="relative mx-auto w-full max-w-7xl px-5 pb-12 pt-16 sm:px-8 lg:pb-16 lg:pt-24">
        <motion.div
          initial="hidden"
          animate="show"
          variants={stagger}
          className="relative overflow-hidden rounded-[2.25rem] border border-[#B39152]/22 bg-[#141D46] px-6 py-10 text-[#FDF7F1] shadow-[0_34px_100px_rgba(20,29,70,0.28)] sm:px-10 sm:py-14 lg:px-14 lg:py-16"
        >
          <div
            aria-hidden
            className="ftt-hiw-glow pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[#B39152]/25 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.075]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(253,247,241,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(253,247,241,0.55) 1px, transparent 1px)",
              backgroundSize: "42px 42px",
            }}
          />

          <div className="relative grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <motion.div variants={fadeUp} className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.42em] text-[#B39152]">
                {eyebrow}
              </p>

              <motion.h1
                variants={titleContainer}
                className="mt-6 max-w-4xl font-serif text-[3.2rem] font-medium leading-[0.93] tracking-[-0.055em] text-[#FDF7F1] sm:text-6xl lg:text-[5.7rem]"
              >
                {titleWords.map((word, index) => (
                  <span
                    key={`${word}-${index}`}
                    className="inline-block overflow-hidden align-bottom"
                  >
                    <motion.span
                      variants={titleWord}
                      className="inline-block pr-[0.24em]"
                    >
                      {word}
                    </motion.span>
                  </span>
                ))}
              </motion.h1>

              <p className="mt-7 max-w-2xl text-base leading-8 text-[#FDF7F1]/76 sm:text-lg">
                {description}
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setConnectOpen(true)}
                  className="group inline-flex items-center justify-center rounded-full bg-[#FDF7F1] px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#141D46] shadow-[0_16px_44px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-0.5 hover:bg-white"
                >
                  Submit your saree
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>

                <Link
                  href="/collection"
                  className="group inline-flex items-center justify-center rounded-full border border-[#FDF7F1]/24 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#FDF7F1] transition duration-300 hover:-translate-y-0.5 hover:border-[#B39152]/70 hover:text-[#B39152]"
                >
                  Explore the collection
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="relative flex min-h-[360px] items-center justify-center"
            >
              <div
                aria-hidden
                className="ftt-hiw-orbit absolute h-72 w-72 rounded-full border border-[#B39152]/25"
              >
                <span className="absolute left-1/2 top-[-7px] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-[#B39152]" />
                <span className="absolute bottom-[-5px] right-12 h-2.5 w-2.5 rounded-full bg-[#FDF7F1]/70" />
              </div>

              <Card className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-[#B39152]/25 bg-[#FDF7F1]/95 p-6 text-[#141D46] shadow-[0_24px_70px_rgba(0,0,0,0.24)] backdrop-blur">
                <div className="mb-7 flex items-center justify-between gap-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#B39152]">
                      FTT process
                    </p>
                    <h2 className="mt-2 font-serif text-3xl leading-tight tracking-[-0.03em] text-[#141D46]">
                      From trunk to wardrobe
                    </h2>
                  </div>

                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#141D46] text-[#B39152]">
                    <Gem className="h-6 w-6" strokeWidth={1.6} />
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    "Receive",
                    "Review",
                    "Re-store",
                    "Wrap",
                    "Deliver",
                  ].map((item, index) => (
                    <div
                      key={item}
                      className="flex items-center justify-between rounded-2xl border border-[#B39152]/18 bg-white/72 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-[#141D46]">
                        {item}
                      </span>
                      <span className="font-serif text-xl text-[#B39152]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                  ))}
                </div>

                <Separator className="my-6 bg-[#B39152]/20" />

                <p className="text-sm leading-6 text-[#141D46]/72">
                  A careful, low-waste journey for sarees that deserve more than
                  storage.
                </p>
              </Card>
            </motion.div>
          </div>

          <motion.div
            variants={fadeUp}
            className="relative mt-12 grid gap-3 sm:grid-cols-3"
          >
            {[
              ["01", "Authenticated"],
              ["02", "Condition graded"],
              ["03", "Care packed"],
            ].map(([number, label]) => (
              <div
                key={label}
                className="rounded-[1.5rem] border border-[#FDF7F1]/12 bg-[#FDF7F1]/8 p-5 backdrop-blur"
              >
                <p className="font-serif text-4xl text-[#B39152]">
                  {number}
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#FDF7F1]/70">
                  {label}
                </p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      <section className="relative mx-auto grid w-full max-w-7xl gap-10 px-5 pb-20 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:pb-24">
        <motion.aside
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.34 }}
          variants={fadeUp}
          className="lg:sticky lg:top-24 lg:self-start"
        >
          <Card className="overflow-hidden rounded-[2rem] border border-[#B39152]/18 bg-white/72 p-6 shadow-[0_18px_60px_rgba(20,29,70,0.09)] backdrop-blur sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#B39152]">
              The promise
            </p>

            <h2 className="mt-5 font-serif text-4xl leading-tight tracking-[-0.04em] text-[#141D46]">
              Nothing is rushed. Nothing is treated like inventory.
            </h2>

            <p className="mt-5 text-sm leading-7 text-[#141D46]/68">
              We handle each saree like a textile with memory, not a product
              pulled from a shelf.
            </p>

            <div className="mt-8 grid gap-3">
              {TRUST_ITEMS.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-[#B39152]/15 bg-[#FDF7F1] p-4"
                  >
                    <div className="flex gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#141D46] text-[#B39152]">
                        <Icon className="h-4 w-4" strokeWidth={1.7} />
                      </div>

                      <div>
                        <h3 className="font-serif text-xl text-[#141D46]">
                          {item.title}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-[#141D46]/66">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.aside>

        <section ref={timelineRef} className="relative">
          <div
            aria-hidden
            className="absolute left-8 top-8 hidden h-[calc(100%-4rem)] w-px bg-[#B39152]/20 sm:block"
          />
          <div
            ref={threadFillRef}
            aria-hidden
            className="absolute left-8 top-8 hidden h-[calc(100%-4rem)] w-px origin-top bg-[#B39152] shadow-[0_0_18px_rgba(179,145,82,0.45)] sm:block"
          />
          <div
            ref={beadRef}
            aria-hidden
            className="absolute left-8 top-8 z-10 hidden h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#B39152] shadow-[0_0_0_6px_rgba(179,145,82,0.12),0_0_22px_rgba(179,145,82,0.55)] sm:block"
          />

          <motion.ol
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.12 }}
            variants={stagger}
            className="space-y-5"
          >
            {steps.map((step, index) => {
              const Icon = STEP_ICONS[index] ?? HandHeart;

              return (
                <motion.li
                  key={`${step.title}-${index}`}
                  variants={fadeUp}
                  className="ftt-hiw-station relative grid gap-4 sm:grid-cols-[4rem_1fr] sm:gap-6"
                >
                  <div className="ftt-hiw-node relative z-10 flex h-16 w-16 items-center justify-center rounded-full border border-[#B39152]/25 bg-[#FDF7F1] text-[#601D1C] shadow-[0_16px_40px_rgba(96,29,28,0.12)] transition duration-500">
                    <Icon className="h-6 w-6" strokeWidth={1.65} />
                  </div>

                  <Card
                    className={cn(
                      "group overflow-hidden rounded-[2rem] border border-[#B39152]/16 bg-white/76 p-6 shadow-[0_18px_60px_rgba(20,29,70,0.08)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-[#B39152]/38 hover:shadow-[0_26px_80px_rgba(20,29,70,0.14)]",
                      index === 2 && "bg-[#FDF7F1]",
                    )}
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#B39152]">
                          Step {String(index + 1).padStart(2, "0")}
                        </p>

                        <h3 className="mt-3 font-serif text-3xl leading-tight tracking-[-0.03em] text-[#141D46] sm:text-4xl">
                          {step.title}
                        </h3>

                        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#141D46]/68 sm:text-base">
                          {step.description}
                        </p>
                      </div>

                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#B39152]/20 bg-[#FDF7F1] text-[#B39152] transition duration-300 group-hover:bg-[#141D46]">
                        <CheckCircle2 className="h-5 w-5" strokeWidth={1.7} />
                      </div>
                    </div>

                    <div className="mt-6 rounded-2xl border border-[#B39152]/12 bg-[#FDF7F1]/82 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#141D46]/55">
                        {STEP_NOTES[index] ?? "Handled with care."}
                      </p>
                    </div>
                  </Card>
                </motion.li>
              );
            })}
          </motion.ol>
        </section>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.25 }}
          variants={fadeUp}
          className="relative overflow-hidden rounded-[2rem] border border-[#141D46]/10 bg-[#601D1C] p-6 text-[#FDF7F1] shadow-[0_28px_90px_rgba(96,29,28,0.22)] sm:p-8 lg:p-10"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#B39152]/22 blur-3xl"
          />

          <div className="relative grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#B39152]">
                Circular by design
              </p>

              <h2 className="mt-4 font-serif text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">
                A saree does not lose its past. It simply finds a new home.
              </h2>

              <p className="mt-5 max-w-xl text-sm leading-7 text-[#FDF7F1]/72">
                Each piece leaves with its condition checked, its care noted, and
                its story carried forward with respect.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["01", "Story documented"],
                ["02", "Condition graded"],
                ["03", "Care packed"],
              ].map(([number, label]) => (
                <div
                  key={label}
                  className="rounded-[1.5rem] border border-[#FDF7F1]/12 bg-[#FDF7F1]/8 p-5 backdrop-blur"
                >
                  <p className="font-serif text-4xl text-[#B39152]">
                    {number}
                  </p>
                  <p className="mt-3 text-sm font-medium uppercase tracking-[0.18em] text-[#FDF7F1]/75">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      <div className="mx-auto flex w-full max-w-7xl items-center justify-center px-5 pb-16 sm:px-8">
        <Link
          href="#top"
          className="ftt-hiw-cue inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.32em] text-[#141D46]/50 transition hover:text-[#141D46]"
          onClick={(event) => {
            event.preventDefault();
            window.scrollTo({
              top: 0,
              behavior: reduceMotion ? "auto" : "smooth",
            });
          }}
        >
          Back to top
          <ChevronDown className="h-4 w-4 rotate-180 text-[#B39152]" />
        </Link>
      </div>

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </main>
  );
}

const CSS = `
.ftt-hiw {
  --royal-navy: #141D46;
  --burgundy: #601D1C;
  --ivory: #FDF7F1;
  --gold: #B39152;
  --midnight: #0E0D0E;
}

.ftt-hiw * {
  box-sizing: border-box;
}

.ftt-hiw a:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 4px;
  border-radius: 999px;
}

.ftt-hiw-station.is-active .ftt-hiw-node {
  background: var(--royal-navy);
  color: var(--gold);
  border-color: rgba(179, 145, 82, 0.7);
  box-shadow:
    0 18px 46px rgba(20, 29, 70, 0.20),
    0 0 0 7px rgba(179, 145, 82, 0.11);
  transform: scale(1.06);
}

@keyframes ftt-hiw-bob {
  0%, 100% {
    transform: translateY(0) rotate(180deg);
  }
  50% {
    transform: translateY(-5px) rotate(180deg);
  }
}

.ftt-hiw-cue svg {
  animation: ftt-hiw-bob 2.4s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .ftt-hiw *,
  .ftt-hiw *::before,
  .ftt-hiw *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }
}
`;