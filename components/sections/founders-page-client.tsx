"use client";

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  HandHeart,
  type LucideIcon,
  PackageCheck,
  Play,
  ShieldCheck,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Founder = {
  id: string;
  name: string;
  designation: string;
  focus: string;
  contribution: string;
  note: string;
  image: string;
  imageAlt: string;
  responsibilities: string[];
};

const founders: Founder[] = [
  {
    id: "curation",
    name: "Founder One",
    designation: "Co-founder, Curation and Provenance",
    focus: "The hand that chooses",
    contribution:
      "Builds every edit through fabric, origin, condition, and the quiet story a saree already carries.",
    note: "I want every piece to feel like it was found with patience, not uploaded in a hurry.",
    image: "/hero/timeless.JPG",
    imageAlt: "Founder One reviewing sarees for the trunk",
    responsibilities: [
      "Curates trunks around fabric, occasion, and provenance.",
      "Reviews condition notes before each piece reaches the collection.",
      "Shapes the edit so each saree has room to be understood.",
    ],
  },
  {
    id: "care",
    name: "Founder Two",
    designation: "Co-founder, Restoration and Care",
    focus: "The hand that restores",
    contribution:
      "Leads the care process: inspection, folding, storage, grading, and the small rituals before dispatch.",
    note: "A saree can be pre-loved and still feel deeply respected. That is the standard.",
    image: "/hero/you.png",
    imageAlt: "Founder Two preparing a saree with care",
    responsibilities: [
      "Checks fabric integrity, fall, borders, and signs of wear.",
      "Documents care notes so the next wardrobe knows how to keep the piece well.",
      "Keeps packing intentional, protective, and worthy of the garment.",
    ],
  },
  {
    id: "community",
    name: "Founder Three",
    designation: "Co-founder, Community and Styling",
    focus: "The hand that connects",
    contribution:
      "Keeps the trunk close to real wardrobes through styling guidance, collector stories, and buyer care.",
    note: "The right saree should feel personal before it feels purchased.",
    image: "/banner/collection-banner2.png",
    imageAlt: "Founder Three building community around pre-loved sarees",
    responsibilities: [
      "Guides styling consults and helps customers choose by mood, drape, and moment.",
      "Builds trust with sellers, collectors, and women returning sarees to circulation.",
      "Carries the FTT voice across community, social, and after-purchase care.",
    ],
  },
];

const pactItems = [
  {
    title: "Authenticated by hand.",
    body: "Every piece is inspected for fabric, condition, and provenance before it enters the trunk.",
    icon: ShieldCheck,
  },
  {
    title: "Restored with care.",
    body: "We clean, fold, store, and prepare each saree with the patience heirloom textiles deserve.",
    icon: HandHeart,
  },
  {
    title: "Re-worn with pride.",
    body: "The goal is not resale alone. It is helping a saree find its next story with dignity.",
    icon: PackageCheck,
  },
] as const;

const welcomeVideo = "/Welcoming.mp4";
const welcomePoster = "/banner/collection_banner.png";

export function FoundersPageClient() {
  return (
    <div className="overflow-x-hidden bg-[#FDF7F1] text-[#0E0D0E]">
      <HeroSection />
      <FounderCardsSection />
      <ContributionTabsSection />
      <FounderNotesSection />
      <FounderPactSection />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
      <div className="mx-auto grid max-w-7xl overflow-hidden rounded-[2rem] border border-[#B39152]/22 bg-[#141D46] shadow-[0_24px_70px_rgba(20,29,70,0.16)] lg:grid-cols-[0.94fr_1.06fr]">
        <div className="flex min-h-[35rem] flex-col justify-between gap-10 p-6 text-[#FDF7F1] sm:p-9 lg:min-h-[42rem] lg:p-12">
          <div className="flex flex-col gap-7">
            <Badge className="w-fit rounded-full border border-[#B39152]/30 bg-[#B39152]/10 px-4 py-2 text-[10px] uppercase tracking-[0.32em] text-[#B39152] hover:bg-[#B39152]/10">
              The three hands
            </Badge>

            <div className="flex max-w-2xl flex-col gap-6">
              <h1 className="font-serif text-[clamp(3.4rem,8vw,7rem)] leading-[0.86] tracking-normal text-[#FDF7F1]">
                Meet the hands behind the trunk.
              </h1>
              <p className="max-w-xl text-base leading-8 text-[#FDF7F1]/72 sm:text-lg">
                From the Trunk is built by three founders across curation,
                care, and community. Together, they return heritage sarees to
                circulation with provenance, patience, and pride.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <WelcomeDialog>
                <Button
                  className="h-12 rounded-full border border-[#B39152]/45 bg-[#B39152] px-6 text-sm font-semibold text-[#0E0D0E] shadow-[0_16px_34px_rgba(179,145,82,0.18)] hover:bg-[#c5a767]"
                  type="button"
                >
                  <Play />
                  Watch the welcome
                </Button>
              </WelcomeDialog>

              <Button
                asChild
                variant="outline"
                className="h-12 rounded-full border-[#FDF7F1]/28 bg-[#FDF7F1]/8 px-6 text-sm font-semibold text-[#FDF7F1] hover:bg-[#FDF7F1] hover:text-[#141D46]"
              >
                <Link href="/collection">
                  Explore the collection
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <HeroMetric value="03" label="Founders" />
            <HeroMetric value="03" label="Hands of care" />
            <HeroMetric value="01" label="Circular promise" />
          </div>
        </div>

        <div className="relative min-h-[32rem] overflow-hidden bg-[#601D1C] lg:min-h-full">
          <div className="ftt-founder-video-mask absolute inset-4 overflow-hidden rounded-[1.5rem] border border-[#B39152]/24 bg-[#0E0D0E] shadow-[0_22px_58px_rgba(14,13,14,0.34)] sm:inset-6">
            <video
              aria-label="Muted founder welcome preview"
              autoPlay
              className="h-full w-full object-cover"
              loop
              muted
              playsInline
              poster={welcomePoster}
              preload="metadata"
              src={welcomeVideo}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,13,14,0.02)_0%,rgba(14,13,14,0.10)_45%,rgba(14,13,14,0.72)_100%)]" />
            <div className="absolute inset-x-5 bottom-5 rounded-[1.4rem] border border-white/12 bg-[#0E0D0E]/42 p-4 text-[#FDF7F1] backdrop-blur-md sm:inset-x-7 sm:bottom-7 sm:p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[#B39152]">
                Founder welcome
              </p>
              <p className="mt-2 max-w-lg font-serif text-2xl leading-tight sm:text-3xl">
                A private note from the people who choose, restore, and send
                each piece onward.
              </p>
            </div>
          </div>

          <button
            className="pointer-events-none absolute right-8 top-8 grid h-15 w-15 place-items-center rounded-full border border-[#B39152]/36 bg-[#FDF7F1]/88 text-[#141D46] shadow-[0_16px_40px_rgba(14,13,14,0.18)] backdrop-blur"
            type="button"
            aria-hidden="true"
            tabIndex={-1}
          >
            <Play className="ml-1 h-6 w-6 fill-current" />
          </button>
        </div>
      </div>
    </section>
  );
}

function WelcomeDialog({ children }: { children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-5xl overflow-hidden rounded-[1.75rem] border border-[#B39152]/25 bg-[#0E0D0E] p-0 text-[#FDF7F1] shadow-[0_32px_90px_rgba(14,13,14,0.4)]">
        <DialogHeader className="sr-only">
          <DialogTitle>Founder welcome video</DialogTitle>
          <DialogDescription>
            A full welcome video from the From the Trunk founders.
          </DialogDescription>
        </DialogHeader>
        <div className="relative aspect-video w-full bg-[#0E0D0E]">
          <video
            className="h-full w-full object-cover"
            controls
            playsInline
            poster={welcomePoster}
            preload="metadata"
            src={welcomeVideo}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeroMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
      <p className="font-serif text-4xl leading-none text-[#FDF7F1]">
        {value}
      </p>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#FDF7F1]/52">
        {label}
      </p>
    </div>
  );
}

function FounderCardsSection() {
  return (
    <section className="px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto flex max-w-7xl flex-col gap-9">
        <SectionHeader
          eyebrow="Founders"
          title="The three hands behind the trunk."
          body="Each founder owns a different form of trust: what enters the trunk, how it is cared for, and how it finds its next wardrobe."
        />

        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0">
          {founders.map((founder, index) => (
            <FounderCard
              key={founder.id}
              founder={founder}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FounderCard({ founder, index }: { founder: Founder; index: number }) {
  return (
    <article
      className="ftt-founder-card ftt-founder-reveal group relative isolate flex min-w-[82vw] flex-col overflow-hidden rounded-[1.65rem] border border-[#B39152]/18 bg-[#FFFCF8] p-3 shadow-[0_18px_54px_rgba(20,29,70,0.09)] transition duration-500 hover:-translate-y-1 focus-within:-translate-y-1 sm:min-w-[24rem] lg:min-w-0"
      style={{ "--founder-delay": `${index * 120}ms` } as CSSProperties}
    >
      <Link
        href={`#${founder.id}`}
        className="relative block overflow-hidden rounded-[1.25rem] bg-[#601D1C]"
        aria-label={`Read about ${founder.name}`}
      >
        <div className="relative aspect-[4/5]">
          <Image
            src={founder.image}
            alt={founder.imageAlt}
            fill
            sizes="(max-width: 1024px) 82vw, 33vw"
            className="object-cover transition duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,13,14,0.03)_0%,rgba(14,13,14,0.08)_42%,rgba(14,13,14,0.66)_100%)]" />
        </div>

        <Badge className="absolute left-4 top-4 rounded-full border border-[#B39152]/35 bg-[#FDF7F1]/90 px-3 py-1.5 text-[9px] uppercase tracking-[0.2em] text-[#601D1C] shadow-sm hover:bg-[#FDF7F1]/90">
          {founder.focus}
        </Badge>
      </Link>

      <div className="flex min-h-[20rem] flex-1 flex-col justify-between gap-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#B39152]">
              {founder.designation}
            </p>
            <h2 className="font-serif text-4xl leading-[0.95] text-[#601D1C]">
              {founder.name}
            </h2>
          </div>

          <p className="text-sm leading-7 text-[#601D1C]/70">
            {founder.contribution}
          </p>
        </div>

        <blockquote className="rounded-[1.25rem] border border-[#601D1C]/10 bg-[#FDF7F1] p-4 text-sm leading-6 text-[#141D46]/78">
          {founder.note}
        </blockquote>
      </div>
    </article>
  );
}

function ContributionTabsSection() {
  return (
    <section className="px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.74fr_1.26fr] lg:items-start">
        <SectionHeader
          eyebrow="Contribution"
          title="Each role protects a different part of the promise."
          body="The trunk works because curation, care, and community are separate responsibilities with one shared standard."
        />

        <Tabs
          defaultValue={founders[0]?.id}
          className="rounded-[1.75rem] border border-[#B39152]/20 bg-[#FFFCF8] p-4 shadow-[0_18px_54px_rgba(20,29,70,0.08)] sm:p-5"
        >
          <TabsList className="flex h-auto w-full justify-start gap-2 overflow-x-auto rounded-full border border-[#601D1C]/10 bg-[#FDF7F1] p-1">
            {founders.map((founder) => (
              <TabsTrigger
                key={founder.id}
                value={founder.id}
                className="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#601D1C]/62 data-[state=active]:bg-[#141D46] data-[state=active]:text-[#FDF7F1] data-[state=active]:shadow-none"
              >
                {founder.focus.replace("The hand that ", "")}
              </TabsTrigger>
            ))}
          </TabsList>

          {founders.map((founder) => (
            <TabsContent
              key={founder.id}
              value={founder.id}
              className="ftt-founder-tab-panel mt-5 rounded-[1.35rem] bg-[#141D46] p-5 text-[#FDF7F1] outline-none sm:p-7"
              id={founder.id}
            >
              <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
                <div className="flex flex-col gap-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#B39152]">
                    {founder.designation}
                  </p>
                  <h3 className="font-serif text-[clamp(2.4rem,4vw,4.6rem)] leading-[0.92] text-[#FDF7F1]">
                    {founder.focus}.
                  </h3>
                  <p className="text-sm leading-7 text-[#FDF7F1]/70">
                    {founder.contribution}
                  </p>
                </div>

                <div className="grid gap-3">
                  {founder.responsibilities.map((item) => (
                    <div
                      key={item}
                      className="flex gap-3 rounded-2xl border border-white/10 bg-white/8 p-4"
                    >
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#B39152]/16 text-[#B39152]">
                        <Check className="h-4 w-4" />
                      </span>
                      <p className="text-sm leading-6 text-[#FDF7F1]/78">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

function FounderNotesSection() {
  return (
    <section className="px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
        <SectionHeader
          eyebrow="Founder notes"
          title="A few private lines from the people building the trunk."
          body="Short notes from the founders on why this work needs attention, restraint, and care."
        />

        <Accordion
          type="single"
          collapsible
          defaultValue={founders[0]?.id}
          className="rounded-[1.75rem] border border-[#B39152]/20 bg-[#FFFCF8] p-3 shadow-[0_18px_54px_rgba(20,29,70,0.08)]"
        >
          {founders.map((founder) => (
            <AccordionItem
              key={founder.id}
              value={founder.id}
              className="border-[#601D1C]/10 px-3 last:border-b-0 sm:px-5"
            >
              <AccordionTrigger className="py-5 text-left hover:no-underline">
                <span className="flex flex-col gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#B39152]">
                    {founder.designation}
                  </span>
                  <span className="font-serif text-3xl leading-none text-[#601D1C]">
                    {founder.name}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-6 text-base leading-8 text-[#601D1C]/70">
                {founder.note}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function FounderPactSection() {
  return (
    <section className="px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
      <div className="mx-auto overflow-hidden rounded-[2rem] border border-[#B39152]/24 bg-[#141D46] p-6 text-[#FDF7F1] shadow-[0_24px_70px_rgba(20,29,70,0.16)] sm:p-8 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div className="flex flex-col gap-5">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#B39152]">
              The FTT pact
            </p>
            <h2 className="max-w-xl font-serif text-[clamp(2.9rem,5vw,6rem)] leading-[0.88] text-[#FDF7F1]">
              A promise before every dispatch.
            </h2>
          </div>

          <p className="max-w-2xl text-base leading-8 text-[#FDF7F1]/70 lg:justify-self-end">
            The founders built FTT around a simple standard: a saree should be
            passed forward only when its next chapter can feel trustworthy,
            beautiful, and complete.
          </p>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {pactItems.map((item) => (
            <PactItem key={item.title} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PactItem({
  title,
  body,
  icon: Icon,
}: {
  title: string;
  body: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/8 p-5">
      <span className="grid h-11 w-11 place-items-center rounded-full border border-[#B39152]/28 bg-[#B39152]/12 text-[#B39152]">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-5 font-serif text-3xl leading-none text-[#FDF7F1]">
        {title}
      </h3>
      <p className="mt-4 text-sm leading-7 text-[#FDF7F1]/68">{body}</p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
  className,
}: {
  eyebrow: string;
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#B39152]">
        {eyebrow}
      </p>
      <h2 className="max-w-3xl font-serif text-[clamp(2.8rem,5vw,5.75rem)] leading-[0.9] text-[#601D1C]">
        {title}
      </h2>
      <p className="max-w-2xl text-base leading-8 text-[#601D1C]/68">
        {body}
      </p>
    </div>
  );
}
