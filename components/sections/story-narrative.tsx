"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { Button } from "@/components/ui/button";

interface StoryNarrativeProps {
  images: string[];
}

const beats = [
  {
    paragraphs: [
      "There\u2019s something quietly powerful about a saree. It carries more than fabric \u2014 it holds memories, milestones, and moments that once meant everything.",
      "In so many homes, these beautiful pieces lie tucked away, preserved but forgotten.",
    ],
  },
  {
    paragraphs: [
      "From the Trunk was born from a simple, heartfelt belief: these sarees still have stories left to tell.",
    ],
  },
  {
    paragraphs: [
      "By giving your pre-loved sarees a second life, you\u2019re not just clearing space \u2014 you\u2019re passing on heritage, emotion, and craftsmanship.",
      "Each saree becomes a bridge between past and present, finding new meaning in someone else\u2019s journey.",
    ],
  },
  {
    paragraphs: [
      "And in doing so, you\u2019re also making a conscious, sustainable choice \u2014 reducing waste while celebrating timeless fashion.",
    ],
  },
];

const climaxLines = [
  "At From the Trunk, we don\u2019t just collect sarees.",
  "We honor them.",
  "We preserve their stories.",
  "And we help them be loved all over again.",
];

export function StoryNarrative({ images }: StoryNarrativeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    prefersReducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion.current) return;

    gsap.registerPlugin(ScrollTrigger);

    const mm = gsap.matchMedia();

    const ctx = gsap.context(() => {
      if (!containerRef.current) return;

      gsap.fromTo(
        ".story-hero-text",
        { autoAlpha: 0, y: 40 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 1,
          ease: "power3.out",
          stagger: 0.2,
        }
      );

      gsap.to(".story-hero-image", {
        yPercent: 20,
        ease: "none",
        scrollTrigger: {
          trigger: ".story-hero",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });

      mm.add("(min-width: 1024px)", () => {
        document.querySelectorAll<HTMLElement>(".story-beat").forEach((section) => {
          const textEls = section.querySelectorAll(".beat-text");
          const imageEl = section.querySelector(".beat-image");

          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: section,
              start: "top 80%",
              end: "center 40%",
              scrub: 0.6,
            },
          });

          tl.fromTo(
            textEls,
            { autoAlpha: 0, y: 30 },
            { autoAlpha: 1, y: 0, stagger: 0.15, ease: "power2.out" }
          );

          if (imageEl) {
            gsap.fromTo(
              imageEl,
              { yPercent: 8 },
              {
                yPercent: -8,
                ease: "none",
                scrollTrigger: {
                  trigger: section,
                  start: "top bottom",
                  end: "bottom top",
                  scrub: true,
                },
              }
            );
          }
        });
      });

      mm.add("(max-width: 1023px)", () => {
        document.querySelectorAll<HTMLElement>(".story-beat").forEach((section) => {
          const textEls = section.querySelectorAll(".beat-text");

          gsap.fromTo(
            textEls,
            { autoAlpha: 0, y: 20 },
            {
              autoAlpha: 1,
              y: 0,
              stagger: 0.12,
              ease: "power2.out",
              scrollTrigger: {
                trigger: section,
                start: "top 85%",
                toggleActions: "play none none reverse",
              },
            }
          );
        });
      });

      const climaxEls = containerRef.current?.querySelectorAll(".climax-line");
      if (climaxEls) {
        gsap.fromTo(
          climaxEls,
          { autoAlpha: 0, y: 24, scale: 0.96 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            stagger: 0.18,
            ease: "power3.out",
            scrollTrigger: {
              trigger: ".story-climax",
              start: "top 70%",
              end: "center 50%",
              scrub: 0.5,
            },
          }
        );
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef}>
      {/* --- Hero --- */}
      <section className="story-hero relative flex min-h-[85vh] items-end overflow-hidden lg:min-h-screen">
        <div className="story-hero-image absolute inset-0">
          <Image
            src={images[0]}
            alt="Heirloom saree"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        </div>
        <div className="relative mx-auto w-full max-w-5xl space-y-4 px-4 pb-16 sm:px-6 sm:pb-24 lg:pb-32">
          <p className="story-hero-text text-xs uppercase tracking-[0.5em] text-amber-100/60">
            Our Manifesto
          </p>
          <h1 className="story-hero-text font-serif text-4xl leading-tight text-white sm:text-5xl lg:text-7xl">
            Why we do
            <br />
            what we do
          </h1>
          <p className="story-hero-text max-w-lg text-base text-amber-100/70 sm:text-lg">
            A story of heritage, second chances, and the quiet power of a saree.
          </p>
        </div>
      </section>

      {/* --- Narrative beats --- */}
      <div className="mx-auto w-full max-w-6xl space-y-0">
        {beats.map((beat, i) => {
          const imageOnRight = i % 2 === 0;
          const isOverlay = i === 3;

          if (isOverlay) {
            return (
              <section
                key={i}
                className="story-beat relative flex min-h-[70vh] items-center overflow-hidden lg:min-h-[80vh]"
              >
                <div className="beat-image absolute inset-0">
                  <Image
                    src={images[i] ?? images[0]}
                    alt=""
                    fill
                    sizes="100vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/50 to-black/30" />
                </div>
                <div className="relative mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
                  {beat.paragraphs.map((p, j) => (
                    <p
                      key={j}
                      className="beat-text max-w-xl font-serif text-xl leading-relaxed text-white/90 sm:text-2xl lg:text-3xl"
                      style={{ marginTop: j > 0 ? "1.5rem" : 0 }}
                    >
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            );
          }

          return (
            <section
              key={i}
              className="story-beat grid min-h-[60vh] items-center gap-8 px-4 py-16 sm:px-6 sm:py-24 lg:min-h-[75vh] lg:grid-cols-2 lg:gap-16 lg:py-0"
            >
              <div
                className={`space-y-6 ${imageOnRight ? "lg:order-1" : "lg:order-2"}`}
              >
                {beat.paragraphs.map((p, j) => (
                  <p
                    key={j}
                    className="beat-text font-serif text-xl leading-relaxed text-foreground sm:text-2xl lg:text-3xl"
                  >
                    {p}
                  </p>
                ))}
              </div>
              <div
                className={`relative aspect-[3/4] overflow-hidden rounded-2xl lg:rounded-3xl ${
                  imageOnRight ? "lg:order-2" : "lg:order-1"
                }`}
              >
                <div className="beat-image absolute inset-0">
                  <Image
                    src={images[i] ?? images[0]}
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* --- Climax --- */}
      <section className="story-climax flex min-h-[70vh] flex-col items-center justify-center px-4 py-20 text-center sm:min-h-[80vh] sm:px-6 lg:min-h-screen">
        <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6 lg:space-y-8">
          {climaxLines.map((line, i) => (
            <p
              key={i}
              className={`climax-line font-serif leading-tight text-foreground ${
                i === 0
                  ? "text-xl sm:text-2xl lg:text-3xl text-muted-foreground"
                  : "text-2xl sm:text-3xl lg:text-5xl"
              }`}
            >
              {line}
            </p>
          ))}
        </div>
        <div className="climax-line mt-12 sm:mt-16">
          <Button asChild className="rounded-full px-10 py-6 text-sm">
            <Link href="/collection">Explore the Collection</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
