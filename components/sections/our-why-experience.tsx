"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  HeartHandshake,
  Leaf,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { ConnectDialog } from "@/components/layout/connect-dialog";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type OurWhyExperienceProps = {
  images?: unknown[];
};

type NormalizedImage = {
  src: string;
  alt: string;
};

const BRAND = {
  navy: "#141D46",
  burgundy: "#601D1C",
  ivory: "#FDF7F1",
  gold: "#B39152",
  midnight: "#0E0D0E",
};

const storyCards = [
  {
    icon: ScrollText,
    title: "Memory",
    description:
      "A saree can hold a wedding morning, a festival evening, a first salary, or a quiet family ritual.",
  },
  {
    icon: BadgeCheck,
    title: "Craft",
    description:
      "We look closely at fabric, border, pallu, weave, zari, age, and the handwork that makes each piece worth preserving.",
  },
  {
    icon: Leaf,
    title: "Circular",
    description:
      "Choosing pre-loved keeps beauty in motion and gives heritage a future without asking the world to make more.",
  },
];

const promiseCards = [
  {
    label: "01",
    title: "We honour",
    text: "Every saree is treated as memory, not inventory.",
  },
  {
    label: "02",
    title: "We preserve",
    text: "Condition, provenance, craft, and care are documented before listing.",
  },
  {
    label: "03",
    title: "We re-store",
    text: "The piece begins again with someone who will love it next.",
  },
];

const fadeUp: Variants = {
  hidden: {
    opacity: 0,
    y: 22,
    filter: "blur(8px)",
  },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.7,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNestedString(
  record: Record<string, unknown>,
  path: string[],
): string | null {
  let current: unknown = record;

  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }

  return typeof current === "string" && current.trim().length > 0
    ? current
    : null;
}

function normalizeImage(image: unknown, index: number): NormalizedImage | null {
  if (typeof image === "string" && image.trim().length > 0) {
    return {
      src: image,
      alt: `From the Trunk story image ${index + 1}`,
    };
  }

  if (!isRecord(image)) return null;

  const src =
    getNestedString(image, ["src"]) ??
    getNestedString(image, ["url"]) ??
    getNestedString(image, ["imageUrl"]) ??
    getNestedString(image, ["media", "url"]) ??
    getNestedString(image, ["image", "url"]) ??
    getNestedString(image, ["sizes", "large", "url"]) ??
    getNestedString(image, ["sizes", "card", "url"]) ??
    getNestedString(image, ["sizes", "thumbnail", "url"]);

  if (!src) return null;

  const alt =
    getNestedString(image, ["alt"]) ??
    getNestedString(image, ["media", "alt"]) ??
    getNestedString(image, ["image", "alt"]) ??
    `From the Trunk story image ${index + 1}`;

  return { src, alt };
}

export function OurWhyExperience({ images = [] }: OurWhyExperienceProps) {
  const reduceMotion = useReducedMotion();
  const [connectOpen, setConnectOpen] = useState(false);

  const gallery = images
    .map((image, index) => normalizeImage(image, index))
    .filter((image): image is NormalizedImage => Boolean(image))
    .slice(0, 3);

  return (
    <main
      className="relative isolate overflow-hidden text-[#141D46]"
      style={{ backgroundColor: BRAND.ivory }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#FDF7F1]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(179,145,82,0.20),transparent_30%),radial-gradient(circle_at_92%_8%,rgba(20,29,70,0.12),transparent_34%),linear-gradient(180deg,#FDF7F1_0%,#F7EDE3_100%)]" />
        <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-[#B39152]/10 blur-3xl" />
        <div className="absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-[#141D46]/10 blur-3xl" />
      </div>

      <section className="mx-auto w-full max-w-7xl px-5 pb-12 pt-14 sm:px-8 lg:pb-16 lg:pt-20">
        <motion.div
          initial="hidden"
          animate="show"
          variants={stagger}
          className="grid gap-10 lg:grid-cols-[0.98fr_1.02fr] lg:items-center"
        >
          <motion.div variants={fadeUp} className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.44em] text-[#B39152]">
              Our why
            </p>

            <h1 className="mt-6 font-serif text-5xl font-medium leading-[0.95] tracking-[-0.045em] text-[#141D46] sm:text-6xl lg:text-[5.6rem]">
              A saree is never just fabric.
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-[#141D46]/72 sm:text-lg">
              It carries memory, craft, and a life that began before it reached
              us. From the Trunk exists to honour that past and help each piece
              find its next home with care.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/collection"
                className="group inline-flex items-center justify-center rounded-full bg-[#141D46] px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#FDF7F1] shadow-[0_18px_48px_rgba(20,29,70,0.20)] transition duration-300 hover:-translate-y-0.5"
              >
                Explore the collection
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>

              <button
                type="button"
                onClick={() => setConnectOpen(true)}
                className="group inline-flex items-center justify-center rounded-full border border-[#141D46]/18 bg-white/55 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#141D46] transition duration-300 hover:-translate-y-0.5 hover:border-[#B39152]/60 hover:text-[#601D1C]"
              >
                Share your saree
              </button>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="relative">
            <Card className="relative overflow-hidden rounded-[2.25rem] border border-[#B39152]/18 bg-white/70 p-3 shadow-[0_28px_90px_rgba(20,29,70,0.12)] backdrop-blur">
              <div className="relative min-h-[520px] overflow-hidden rounded-[1.8rem] bg-[#141D46]">
                {gallery[0] ? (
                  <Image
                    src={gallery[0].src}
                    alt={gallery[0].alt}
                    fill
                    priority
                    sizes="(min-width: 1024px) 48vw, 100vw"
                    className="object-cover opacity-82"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(179,145,82,0.28),transparent_30%),linear-gradient(135deg,#141D46,#601D1C)]" />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-[#141D46]/82 via-[#141D46]/20 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 flex p-5 sm:justify-end sm:p-7 lg:p-8">
                  <div className="w-full max-w-[22rem] rounded-[1.5rem] border border-[#FDF7F1]/14 bg-[#FDF7F1]/92 p-5 text-[#141D46] shadow-[0_18px_60px_rgba(0,0,0,0.20)] backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#B39152]">
                      The belief
                    </p>
                    <p className="mt-3 font-serif text-2xl leading-tight tracking-[-0.03em] sm:text-3xl">
                      Beautiful things deserve another beginning.
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <div className="absolute -bottom-8 -left-4 hidden w-44 overflow-hidden rounded-[1.5rem] border border-[#B39152]/18 bg-[#FDF7F1] p-2 shadow-[0_20px_60px_rgba(20,29,70,0.14)] sm:block lg:hidden xl:block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.1rem] bg-[#601D1C]">
                {gallery[1] ? (
                  <Image
                    src={gallery[1].src}
                    alt={gallery[1].alt}
                    fill
                    sizes="12rem"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[#601D1C]" />
                )}
              </div>
            </div>

            <div className="absolute -right-4 -top-8 hidden w-40 overflow-hidden rounded-[1.5rem] border border-[#B39152]/18 bg-[#FDF7F1] p-2 shadow-[0_20px_60px_rgba(20,29,70,0.14)] md:block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.1rem] bg-[#141D46]">
                {gallery[2] ? (
                  <Image
                    src={gallery[2].src}
                    alt={gallery[2].alt}
                    fill
                    sizes="10rem"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[#141D46]" />
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.25 }}
          variants={stagger}
          className="grid gap-4 md:grid-cols-3"
        >
          {storyCards.map((card) => {
            const Icon = card.icon;

            return (
              <motion.div key={card.title} variants={fadeUp}>
                <Card className="h-full rounded-[2rem] border border-[#B39152]/16 bg-white/72 p-6 shadow-[0_18px_60px_rgba(20,29,70,0.08)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-[#B39152]/34 hover:shadow-[0_26px_80px_rgba(20,29,70,0.12)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#141D46] text-[#B39152]">
                    <Icon className="h-5 w-5" strokeWidth={1.65} />
                  </div>

                  <h2 className="mt-6 font-serif text-3xl tracking-[-0.03em] text-[#141D46]">
                    {card.title}
                  </h2>

                  <p className="mt-3 text-sm leading-7 text-[#141D46]/66">
                    {card.description}
                  </p>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 lg:py-16">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.22 }}
          variants={fadeUp}
          className="overflow-hidden rounded-[2.25rem] border border-[#141D46]/10 bg-[#141D46] text-[#FDF7F1] shadow-[0_32px_100px_rgba(20,29,70,0.24)]"
        >
          <div className="grid lg:grid-cols-[0.92fr_1.08fr]">
            <div className="relative min-h-[420px] overflow-hidden bg-[#601D1C]">
              {gallery[1] ? (
                <Image
                  src={gallery[1].src}
                  alt={gallery[1].alt}
                  fill
                  sizes="(min-width: 1024px) 42vw, 100vw"
                  className="object-cover opacity-70"
                />
              ) : null}

              <div className="absolute inset-0 bg-gradient-to-br from-[#601D1C]/92 via-[#601D1C]/76 to-[#141D46]/52" />

              <div className="absolute inset-0 flex flex-col justify-end p-7 sm:p-10">
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#B39152]">
                  Not inventory
                </p>
                <h2 className="mt-4 max-w-xl font-serif text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">
                  Each piece arrives with a past. We help it carry forward.
                </h2>
              </div>
            </div>

            <div className="bg-[#141D46] p-7 sm:p-10 lg:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#B39152]">
                The FTT promise
              </p>

              <h3 className="mt-5 font-serif text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">
                Not pre-owned, re-stored.
              </h3>

              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#FDF7F1]/72 sm:text-base">
                We do not erase a saree’s first life. We document it, care for
                it, and prepare it for someone who will love it next.
              </p>

              <Separator className="my-8 bg-[#FDF7F1]/12" />

              <div className="space-y-4">
                {promiseCards.map((card) => (
                  <div
                    key={card.title}
                    className={cn(
                      "rounded-[1.5rem] border border-[#FDF7F1]/12 bg-[#FDF7F1]/8 p-5",
                      "transition duration-300 hover:bg-[#FDF7F1]/12",
                    )}
                  >
                    <div className="flex gap-4">
                      <span className="font-serif text-3xl leading-none text-[#B39152]">
                        {card.label}
                      </span>
                      <div>
                        <h4 className="font-serif text-2xl tracking-[-0.03em] text-[#FDF7F1]">
                          {card.title}
                        </h4>
                        <p className="mt-1 text-sm leading-6 text-[#FDF7F1]/68">
                          {card.text}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 pb-20 pt-8 sm:px-8 lg:pb-28">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.28 }}
          variants={fadeUp}
        >
          <Card className="overflow-hidden rounded-[2.25rem] border border-[#B39152]/18 bg-white/78 p-6 shadow-[0_24px_80px_rgba(20,29,70,0.10)] backdrop-blur sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#B39152]">
                  The choice
                </p>

                <h2 className="mt-4 max-w-2xl font-serif text-4xl leading-tight tracking-[-0.04em] text-[#141D46] sm:text-5xl">
                  To buy pre-loved is to choose beauty with memory.
                </h2>

                <p className="mt-5 max-w-2xl text-sm leading-7 text-[#141D46]/68 sm:text-base">
                  It is a quieter kind of luxury, one that values craft,
                  restraint, sustainability, and the story already woven into
                  the cloth.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["One-of-one", "No two pieces carry the same story."],
                  ["Authenticated", "Reviewed before it reaches the collection."],
                  ["Care packed", "Wrapped to protect the textile in transit."],
                  ["Conscious", "A more circular way to love sarees."],
                ].map(([title, text]) => (
                  <div
                    key={title}
                    className="rounded-[1.5rem] border border-[#B39152]/14 bg-[#FDF7F1] p-5"
                  >
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#141D46] text-[#B39152]">
                      {title === "Conscious" ? (
                        <Leaf className="h-4 w-4" strokeWidth={1.7} />
                      ) : title === "Authenticated" ? (
                        <ShieldCheck className="h-4 w-4" strokeWidth={1.7} />
                      ) : title === "Care packed" ? (
                        <Sparkles className="h-4 w-4" strokeWidth={1.7} />
                      ) : (
                        <HeartHandshake className="h-4 w-4" strokeWidth={1.7} />
                      )}
                    </div>

                    <h3 className="font-serif text-2xl tracking-[-0.03em] text-[#141D46]">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#141D46]/64">
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      </section>
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </main>
  );
}