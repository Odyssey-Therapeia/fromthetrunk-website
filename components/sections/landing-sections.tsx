"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export type LandingImage = {
  alt: string;
  src: string;
  title?: string;
};

export type LandingProductCard = {
  condition: string;
  detail: string;
  href: string;
  image: string;
  name: string;
  price: string;
};

type LandingSectionsProps = {
  featuredProducts: LandingProductCard[];
  showIntroSeparator?: boolean;
  socialSection: ReactNode;
  storyImages: LandingImage[];
};

const FALLBACK_IMAGES = [
  "/hero/timeless.JPG",
  "/hero/you.png",
  "/hero/banner.png",
  "/hero/banner1.png",
  "/media/home-cover.png",
  "/media/hero-bg.png",
] as const;

const fallbackProducts: LandingProductCard[] = [
  {
    name: "Vintage Kanjeevaram",
    detail: "Late 1990s silk weave",
    condition: "Restored border, provenance noted",
    price: "Price on request",
    href: "/collection",
    image: "/hero/timeless.JPG",
  },
  {
    name: "Ivory Organza Drape",
    detail: "Lightweight festive organza",
    condition: "Quality checked, ready to wear",
    price: "Price on request",
    href: "/collection",
    image: "/hero/you.png",
  },
  {
    name: "Maroon Silk Classic",
    detail: "Heritage silk with zari detail",
    condition: "Gently restored, unique",
    price: "Price on request",
    href: "/collection",
    image: "/hero/banner.png",
  },
  {
    name: "Soft Chiffon Saree",
    detail: "Early 2000s evening drape",
    condition: "Clean finish, archived story",
    price: "Price on request",
    href: "/collection",
    image: "/hero/banner1.png",
  },
  {
    name: "Cotton Silk Heirloom",
    detail: "Breathable cotton-silk blend",
    condition: "Authenticated and refreshed",
    price: "Price on request",
    href: "/collection",
    image: "/media/home-cover.png",
  },
  {
    name: "Kota Cotton Treasure",
    detail: "Featherlight weave",
    condition: "Carefully repaired, next chapter ready",
    price: "Price on request",
    href: "/collection",
    image: "/media/hero-bg.png",
  },
];

const testimonials = [
  {
    name: "Ananya R.",
    text: "The saree felt like it had a soul. The provenance note made the experience personal.",
  },
  {
    name: "Meera S.",
    text: "Restored beautifully without losing its old-world charm.",
  },
  {
    name: "Ritika M.",
    text: "The styling consult helped me pair it with my mother’s jewellery.",
  },
  {
    name: "Devika P.",
    text: "Packaging, fabric, and story all felt thoughtful and refined.",
  },
  {
    name: "Isha K.",
    text: "A rare piece. Everyone asked where it was from.",
  },
];

const story =
  "From family trunks to modern wardrobes, every saree we choose carries a life before this one. We authenticate, restore, and style each piece with care, so its next chapter feels as meaningful as its first.";

const storyChapters = [
  {
    label: "Provenance",
    title: "It begins in a trunk.",
    body: "Every saree arrives with a past - a wardrobe, a wedding, a journey, a woman who wore it before.",
  },
  {
    label: "Restoration",
    title: "We care before we curate.",
    body: "Each piece is checked, refreshed, repaired where needed, and prepared with the attention old textiles deserve.",
  },
  {
    label: "Styling",
    title: "Then we style it for now.",
    body: "The saree keeps its memory, but the look becomes current - easy to wear, photograph, and make your own.",
  },
  {
    label: "Rewear",
    title: "The next chapter is yours.",
    body: "Not pre-owned. Re-storied. A piece of heritage continues its life with someone new.",
  },
];

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function useTypewriter(text: string, speed = 26) {
  const [visibleText, setVisibleText] = useState("");
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = window.setTimeout(() => setVisibleText(text), 0);
      return () => window.clearTimeout(timer);
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  useEffect(() => {
    if (!started) return;

    let index = 0;

    const interval = window.setInterval(() => {
      index += 1;
      setVisibleText(text.slice(0, index));

      if (index >= text.length) {
        window.clearInterval(interval);
      }
    }, speed);

    return () => window.clearInterval(interval);
  }, [started, text, speed]);

  return { ref, visibleText };
}

function fillProducts(products: LandingProductCard[]) {
  const merged = [...products];
  for (const product of fallbackProducts) {
    if (merged.length >= 6) break;
    merged.push(product);
  }
  return merged.slice(0, 6);
}

function fillImages(images: LandingImage[]) {
  const merged = [...images];
  for (const [index, src] of FALLBACK_IMAGES.entries()) {
    if (merged.length >= 5) break;
    merged.push({
      src,
      alt: "Curated saree from From The Trunk",
      title: ["Authenticated", "Restored", "Styled", "Archived", "Re-loved"][
        index
      ],
    });
  }
  return merged.slice(0, 5);
}

function shouldBypassImageOptimizer(src: string) {
  return (
    process.env.NODE_ENV === "development" &&
    (src.startsWith("http://") || src.startsWith("https://"))
  );
}

export function SectionSeparator() {
  return (
    <div className="bg-[#FDF7F1] px-6">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-5 py-3">
        <div className="h-px flex-1 bg-linear-to-r from-transparent via-[#141D46]/28 to-[#141D46]/10" />
        <div className="h-2 w-2 rounded-full bg-[#141D46]" />
        <div className="h-px flex-1 bg-linear-to-l from-transparent via-[#141D46]/28 to-[#141D46]/10" />
      </div>
    </div>
  );
}

export function OurStorySection({ images }: { images: LandingImage[] }) {
  const storyImages = fillImages(images);
  const { ref, visibleText } = useTypewriter(story);
  const [activeImage, setActiveImage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const activeStoryImage = storyImages[activeImage] ?? storyImages[0];
  const activeChapter =
    storyChapters[activeImage % storyChapters.length] ?? storyChapters[0];
  const isTyping = visibleText.length < story.length;

  useEffect(() => {
    if (isPaused || storyImages.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveImage((current) => (current + 1) % storyImages.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, [isPaused, storyImages.length]);

  if (!activeStoryImage || !activeChapter) return null;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 18;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 18;

    event.currentTarget.style.setProperty("--story-x", `${x}px`);
    event.currentTarget.style.setProperty("--story-y", `${y}px`);
  };

  const resetPointer = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--story-x", "0px");
    event.currentTarget.style.setProperty("--story-y", "0px");
  };

  return (
    <section
      id="our-story"
      className="relative overflow-hidden bg-[#FDF7F1] px-6 py-20 md:py-28"
    >
      <div
        className="pointer-events-none absolute left-1/2 top-10 hidden h-[calc(100%-5rem)] w-px -translate-x-1/2 bg-linear-to-b from-transparent via-[#B39152]/25 to-transparent lg:block"
        aria-hidden="true"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div ref={ref} className="relative z-10">
          <div className="mb-6 inline-flex items-center gap-3">
            <span className="h-px w-10 bg-[#B39152]" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#74531B]">
              Our Story
            </p>
          </div>

          <h2 className="max-w-xl font-serif text-[clamp(2.7rem,5vw,6rem)] leading-[0.95] text-[#141D46]">
            A next story to every saree.
          </h2>

          <p className="mt-8 min-h-40 max-w-xl text-[clamp(1rem,1.2vw,1.2rem)] leading-8 text-[#141D46]/58">
            {visibleText}
            {isTyping ? (
              <span className="ml-1 inline-block translate-y-1 animate-pulse text-[#74531B]">
                |
              </span>
            ) : null}
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {storyChapters.map((chapter, index) => {
              const isActive = activeImage % storyChapters.length === index;
              const nextImageIndex = index % storyImages.length;

              return (
                <button
                  key={chapter.label}
                  type="button"
                  onClick={() => setActiveImage(nextImageIndex)}
                  className={[
                    "group rounded-2xl border p-4 text-left transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1]",
                    isActive
                      ? "border-[#B39152]/70 bg-[#141D46] text-[#FDF7F1] shadow-[0_16px_40px_rgba(20,29,70,0.16)]"
                      : "border-[#601D1C]/10 bg-[#FFFCF8]/70 text-[#141D46] hover:-translate-y-0.5 hover:border-[#B39152]/55 hover:bg-[#FFFCF8]",
                  ].join(" ")}
                  aria-pressed={isActive}
                >
                  <span
                    className={[
                      "text-[10px] font-semibold uppercase tracking-[0.26em]",
                      isActive ? "text-[#F5DA8A]" : "text-[#5E4216]",
                    ].join(" ")}
                  >
                    {chapter.label}
                  </span>

                  <span className="mt-2 block font-serif text-xl leading-tight">
                    {chapter.title}
                  </span>

                  <span
                    className={[
                      "mt-2 block text-xs leading-5",
                      isActive ? "text-[#FDF7F1]" : "text-[#141D46]",
                    ].join(" ")}
                  >
                    {chapter.body}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/collection"
              className="inline-flex rounded-full bg-[#141D46] px-5 py-3 text-sm font-medium text-[#FDF7F1] shadow-[0_12px_28px_rgba(20,29,70,0.16)] transition hover:bg-[#0E0D0E]"
            >
              Explore re-storied pieces
            </Link>

            <Link
              href="/our-story"
              className="inline-flex rounded-full border border-[#B39152]/55 px-5 py-3 text-sm font-medium text-[#601D1C] transition hover:bg-[#B39152]/10"
            >
              Read the full story
            </Link>
          </div>
        </div>

        <div
          className="ftt-story-frame relative h-[32rem] overflow-hidden rounded-[1.5rem] bg-[#601D1C] shadow-2xl shadow-[#601D1C]/20 md:h-[40rem]"
          data-paused={isPaused ? "true" : undefined}
          onPointerMove={handlePointerMove}
          onPointerLeave={(event) => {
            resetPointer(event);
            setIsPaused(false);
          }}
          onMouseEnter={() => setIsPaused(true)}
          onFocus={() => setIsPaused(true)}
          onBlur={() => setIsPaused(false)}
        >
          <Image
            key={`${activeStoryImage.src}-${activeImage}`}
            src={activeStoryImage.src}
            alt={activeStoryImage.alt}
            fill
            sizes="(max-width: 1024px) 100vw, 52vw"
            unoptimized={shouldBypassImageOptimizer(activeStoryImage.src)}
            className="ftt-story-image object-cover"
          />

          <div className="absolute inset-0 bg-linear-to-t from-[#0E0D0E]/78 via-[#0E0D0E]/18 to-transparent" />

          <div className="absolute left-5 top-5 z-10 flex items-center gap-2 rounded-full border border-white/20 bg-[#FDF7F1]/90 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#601D1C] shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#B39152]" />
            Chapter {String(activeImage + 1).padStart(2, "0")}
          </div>

          <div className="absolute right-5 top-5 z-10 rounded-full border border-[#B39152]/40 bg-[#141D46]/75 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#FDF7F1] backdrop-blur">
            {activeChapter.label}
          </div>

          <div className="absolute bottom-6 left-6 right-6 z-10 sm:bottom-8 sm:left-8 sm:right-8">
            <p className="text-xs uppercase tracking-[0.3em] text-white/65">
              From The Trunk
            </p>

            <h3 className="mt-2 max-w-xl font-serif text-3xl leading-tight text-white md:text-4xl">
              {activeStoryImage.title ?? activeChapter.title}
            </h3>

            <p className="mt-3 max-w-md text-sm leading-6 text-white/72">
              {activeChapter.body}
            </p>

            <div className="mt-6 flex gap-2">
              {storyImages.map((image, index) => (
                <button
                  key={`${image.src}-dot-${index}`}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  aria-label={`Show story image ${index + 1}`}
                  className="ftt-story-progress relative h-1 overflow-hidden rounded-full bg-white/30 transition-all"
                  data-active={activeImage === index ? "true" : undefined}
                  style={{
                    width: activeImage === index ? "3rem" : "1.75rem",
                  }}
                >
                  <span className="absolute inset-0 origin-left rounded-full bg-[#B39152]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeaturedProductsSection({
  products,
}: {
  products: LandingProductCard[];
}) {
  const productCards = fillProducts(products).slice(0, 6);
  const heroProduct = productCards[0];
  const supportingProducts = productCards.slice(1);

  if (!heroProduct) return null;

  return (
    <section className="bg-[#FDF7F1] px-5 py-16 sm:px-6 md:py-22">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 grid gap-6 border-b border-[#601D1C]/10 pb-8 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] md:items-end">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.34em] text-[#74531B]">
              Featured Products
            </p>
            <h2 className="max-w-4xl font-serif text-5xl leading-none text-[#601D1C] sm:text-6xl lg:text-7xl">
              New arrivals from the trunk.
            </h2>
          </div>

          <div className="space-y-5 md:text-right">
            <p className="text-base leading-7 text-[#601D1C]/70 md:ml-auto md:max-w-md">
              Six handpicked sarees selected for craft, condition, provenance,
              and quiet distinction.
            </p>

            <Link
              href="/collection"
              className="inline-flex rounded-full border border-[#601D1C]/35 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#601D1C] transition hover:border-[#B39152] hover:text-[#B39152]"
            >
              View all pieces
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.45fr)] lg:items-start">
          <FeaturedProductTile product={heroProduct} index={0} variant="hero" />

          <div className="grid grid-cols-2 gap-x-3 gap-y-8 min-[520px]:gap-x-5 min-[520px]:gap-y-10 xl:grid-cols-3">
            {supportingProducts.map((product, index) => {
              const isLastWide =
                supportingProducts.length === 5 &&
                index === supportingProducts.length - 1;

              return (
                <FeaturedProductTile
                  key={`${product.name}-${product.href}`}
                  product={product}
                  index={index + 1}
                  variant={isLastWide ? "wide" : "regular"}
                  className={isLastWide ? "xl:col-span-2" : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

type FeaturedProductTileVariant = "hero" | "regular" | "wide";

function FeaturedProductTile({
  product,
  index,
  variant = "regular",
  className = "",
}: {
  product: LandingProductCard;
  index: number;
  variant?: FeaturedProductTileVariant;
  className?: string;
}) {
  const isHero = variant === "hero";
  const isWide = variant === "wide";

  return (
    <article
      className={[
        "group",
        isHero
          ? "rounded-[1.75rem] border border-[#601D1C]/12 bg-[#FDF7F1] p-2 shadow-[0_18px_50px_rgba(96,29,28,0.10)]"
          : "rounded-[1.35rem] bg-[linear-gradient(135deg,rgba(179,145,82,0.95),rgba(96,29,28,0.22)_42%,rgba(20,29,70,0.32))] p-px shadow-[0_10px_28px_rgba(96,29,28,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(96,29,28,0.12)]",
        className,
      ].join(" ")}
    >
      <Link
        href={product.href}
        className={[
          "block h-full",
          !isHero ? "rounded-[1.3rem] bg-[#FDF7F1]/92 p-2" : "",
        ].join(" ")}
      >
        <div
          className={[
            "relative overflow-hidden bg-[#601D1C]/10",
            isHero
              ? "aspect-[4/5] rounded-[1.45rem]"
              : isWide
                ? "aspect-4/5 rounded-lg xl:aspect-[8/5]"
                : "aspect-4/5 rounded-lg",
          ].join(" ")}
        >
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes={
              isHero
                ? "(max-width: 1024px) 100vw, 42vw"
                : "(max-width: 1024px) 50vw, (max-width: 1536px) 25vw, 18vw"
            }
            unoptimized={shouldBypassImageOptimizer(product.image)}
            className="object-cover transition duration-700 group-hover:scale-105"
          />

          <div
            className={[
              "absolute left-2 top-2 rounded-full bg-[#FDF7F1]/90 font-semibold uppercase text-[#601D1C] shadow-sm backdrop-blur",
              isHero
                ? "px-4 py-2 text-[10px] tracking-[0.18em] min-[520px]:left-4 min-[520px]:top-4"
                : "px-2 py-1 text-[8px] tracking-[0.14em] min-[520px]:left-3 min-[520px]:top-3 min-[520px]:px-3 min-[520px]:py-1.5 min-[520px]:text-[10px] min-[520px]:tracking-[0.16em]",
            ].join(" ")}
          >
            Unique
          </div>

          {isHero ? (
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[#601D1C]/92 via-[#601D1C]/58 to-transparent p-5 pt-20 min-[520px]:p-7 min-[520px]:pt-24">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#B39152]">
                Spotlight piece
              </p>

              <h3 className="max-w-xl font-serif text-4xl leading-none text-[#FDF7F1] min-[520px]:text-5xl lg:text-6xl">
                {product.name}
              </h3>

              <p className="mt-3 max-w-md text-sm leading-6 text-[#FDF7F1]/78">
                {product.detail}
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#FDF7F1]/18 pt-4">
                <div>
                  <p className="text-xs text-[#B39152]">
                    {product.condition}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#FDF7F1]">
                    {product.price}
                  </p>
                </div>

                <span className="inline-flex items-center gap-2 rounded-full border border-[#FDF7F1]/35 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#FDF7F1] transition group-hover:border-[#B39152] group-hover:text-[#B39152]">
                  View Piece
                  <ArrowIcon />
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {!isHero ? (
          <div className="mt-3 min-[520px]:mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#B39152] min-[520px]:text-[10px]">
                Drop {String(index + 1).padStart(2, "0")}
              </p>

              <span className="hidden h-px flex-1 bg-[#601D1C]/10 min-[520px]:block" />
            </div>

            <h3 className="font-serif text-lg leading-tight text-[#601D1C] min-[520px]:text-2xl">
              {product.name}
            </h3>

            <p className="mt-1.5 text-xs text-[#601D1C]/60 min-[520px]:mt-2 min-[520px]:text-sm">
              {product.detail}
            </p>

            <p className="mt-1 text-xs text-[#B39152] min-[520px]:text-sm">
              {product.condition}
            </p>

            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[#601D1C]/10 pt-2.5 min-[520px]:mt-3 min-[520px]:gap-3 min-[520px]:pt-3">
              <p className="text-sm font-semibold text-[#601D1C] min-[520px]:text-base">
                {product.price}
              </p>

              <span className="hidden items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#601D1C] transition group-hover:text-[#B39152] min-[520px]:inline-flex">
                View Piece
                <ArrowIcon />
              </span>
            </div>
          </div>
        ) : null}
      </Link>
    </article>
  );
}

export function TestimonialsSection() {
  const duplicated = [...testimonials, ...testimonials];

  return (
    <section
      id="testimonials"
      className="overflow-hidden bg-[#FDF7F1] py-20 md:py-28"
    >
      <div className="mx-auto mb-12 max-w-7xl px-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.34em] text-[#74531B]">
          Testimonials
        </p>
        <h2 className="max-w-3xl font-serif text-[clamp(2.8rem,5vw,6rem)] leading-none text-[#141D46]">
          Worn again, remembered forever.
        </h2>
      </div>

      <div className="ftt-marquee flex w-max gap-5 px-6">
        {duplicated.map((review, index) => (
          <article
            key={`${review.name}-${index}`}
            className="w-82.5 shrink-0 rounded-4xl border border-[#B39152]/20 bg-[#141D46] p-7 text-white shadow-[0_18px_50px_rgba(20,29,70,0.14)] backdrop-blur-md md:w-107.5"
          >
            <p className="font-serif text-2xl leading-tight text-white/92 md:text-3xl">
              &ldquo;{review.text}&rdquo;
            </p>
            <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-5">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#B39152]">
                {review.name}
              </p>
              <p className="text-sm text-white/50">Verified note</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ConnectWithUsSection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"error" | "idle" | "success">("idle");
  const startedAtRef = useRef(0);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setStatus("idle");

    try {
      const response = await fetch("/api/v2/contact/submit", {
        body: JSON.stringify({
          clientSubmissionId:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : undefined,
          email,
          message,
          name,
          pagePath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          startedAt: startedAtRef.current || undefined,
          website,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) throw new Error("Contact submission failed.");

      setName("");
      setEmail("");
      setMessage("");
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      id="connect"
      className="bg-[#FDF7F1] px-4 py-16 sm:px-6 sm:py-20 md:py-28"
    >
      <div className="mx-auto grid max-w-7xl gap-8 rounded-[1.5rem] bg-[#FDF7F1] p-5 text-white shadow-[0_22px_60px_rgba(20,29,70,0.16)] sm:gap-12 sm:p-6 md:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:p-16">
        <div className="min-w-0">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.34em] text-[#74531B] sm:mb-5">
            Connect With Us
          </p>
          <h2 className="font-serif text-[#141D46] text-[clamp(2.25rem,8vw,3rem)] leading-[1.05] sm:text-[clamp(2.8rem,5vw,6rem)] sm:leading-none">
            Looking for a saree with a story?
          </h2>
          <p className="mt-5 max-w-xl text-[#141D46] leading-7  sm:mt-7 sm:text-lg sm:leading-8">
            Tell us what you are dressing for. We will help you discover a
            restored piece that feels personal, considered, and entirely yours.
          </p>

          <div className="mt-7 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4">
            {[
              ["Explore", "Browse the collection", "/collection"],
              [
                "Instagram",
                "@from.thetrunk",
                "https://www.instagram.com/from.thetrunk/",
              ],
              ["WhatsApp", "Chat with us", "https://wa.me/919731910202"],
              [
                "Email",
                "hello@fromthetrunk.shop",
                "mailto:hello@fromthetrunk.shop",
              ],
            ].map(([label, title, href]) => (
              <a
                key={label}
                href={href}
                className="group min-w-0 rounded-2xl border border-[#FDF7F1]/12 bg-[linear-gradient(135deg,#141D46_0%,#11183C_100%)] p-4 text-[#FDF7F1] shadow-[inset_0_0_0_1px_rgba(253,247,241,0.05)] transition duration-300 hover:-translate-y-0.5 hover:border-[#B39152]/80 hover:bg-[linear-gradient(135deg,#601D1C_0%,#141D46_62%,#0E0D0E_100%)] hover:shadow-[0_18px_36px_rgba(20,29,70,0.22),inset_0_0_0_1px_rgba(179,145,82,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B39152] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDF7F1] sm:p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B39152] transition group-hover:text-[#E5C983]">
                  {label}
                </p>
                <p className="mt-1.5 wrap-break-word font-serif text-xl text-[#FDF7F1] transition group-hover:text-white sm:mt-2 sm:text-2xl">
                  {title}
                </p>
              </a>
            ))}
          </div>
        </div>

        <form
          onFocusCapture={() => {
            if (!startedAtRef.current) startedAtRef.current = Date.now();
          }}
          onSubmit={handleSubmit}
          className="min-w-0 rounded-4xl bg-[#FDF7F1] p-5 text-[#141D46] sm:p-6 md:p-8"
        >
          <div className="grid gap-4 sm:gap-5">
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              name="website"
              className="hidden"
              aria-hidden="true"
            />
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#141D46]">
                Name
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="w-full rounded-full border border-[#141D46]/15 bg-[#FDF7F1] px-4 py-3.5 outline-none transition focus:border-[#B39152] sm:px-5 sm:py-4"
                placeholder="Your name"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#141D46]">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full rounded-full border border-[#141D46]/15 bg-[#FDF7F1] px-4 py-3.5 outline-none transition focus:border-[#B39152] sm:px-5 sm:py-4"
                placeholder="you@example.com"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#141D46]">
                Message
              </span>
              <textarea
                rows={5}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                required
                className="w-full resize-none rounded-3xl border border-[#141D46]/15 bg-[#FDF7F1] px-4 py-3.5 outline-none transition focus:border-[#B39152] sm:px-5 sm:py-4"
                placeholder="Tell us what you are looking for..."
              />
            </label>

            <div aria-live="polite" className="min-h-5 text-sm leading-6">
              {status === "success" ? (
                <p className="text-[#141D46]">
                  Thanks for reaching out — we&rsquo;ve received your request. Our
                  team will contact you shortly.
                </p>
              ) : null}
              {status === "error" ? (
                <p className="text-[#601D1C]">
                  We couldn&rsquo;t send this right now. Please try again.
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#141D46] px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-[#FDF7F1] transition hover:bg-[#0E0D0E] disabled:cursor-not-allowed disabled:opacity-70 sm:py-4"
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {isSubmitting ? "Sending..." : "Send Message"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export function LandingSections({
  featuredProducts,
  showIntroSeparator = true,
  socialSection,
  storyImages,
}: LandingSectionsProps) {
  return (
    <>
      {showIntroSeparator ? <SectionSeparator /> : null}
      <OurStorySection images={storyImages} />
      <SectionSeparator />
      {socialSection}
      <SectionSeparator />
      <FeaturedProductsSection products={featuredProducts} />
      <SectionSeparator />
      <TestimonialsSection />
      <SectionSeparator />
      <ConnectWithUsSection />
    </>
  );
}
