import Link from "next/link";

import type { InstagramSocialCardData } from "@/components/landing/instagram-social-card";
import { SocialReelCarousel } from "@/components/sections/social-reel-carousel";
import type { LandingImage } from "@/components/sections/landing-sections";

const FALLBACK_IMAGES = [
  "/hero/timeless.JPG",
  "/hero/you.png",
  "/hero/banner.png",
  "/hero/banner1.png",
  "/media/home-cover.png",
  "/media/hero-bg.png",
] as const;

const INSTAGRAM_HANDLE =
  process.env.NEXT_PUBLIC_INSTAGRAM_HANDLE ?? "from.thetrunk";

const INSTAGRAM_URL =
  process.env.NEXT_PUBLIC_INSTAGRAM_URL ??
  `https://www.instagram.com/${normalizeHandle(INSTAGRAM_HANDLE)}/`;

type BeholdSize = {
  height?: number;
  mediaUrl?: string;
  width?: number;
};

type BeholdPost = {
  altText?: string;
  caption?: string;
  children?: BeholdPost[];
  colorPalette?: {
    dominant?: string;
    muted?: string;
    mutedDark?: string;
    mutedLight?: string;
    vibrant?: string;
    vibrantDark?: string;
    vibrantLight?: string;
  };
  id: string;
  isReel?: boolean;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string;
  mediaUrl?: string;
  permalink: string;
  prunedCaption?: string;
  sizes?: {
    full?: BeholdSize;
    large?: BeholdSize;
    medium?: BeholdSize;
    small?: BeholdSize;
  };
  thumbnailUrl?: string;
  timestamp?: string;
};

type BeholdFeed = {
  posts?: BeholdPost[];
  username?: string;
};

type LiveSocialFeed = {
  cards: InstagramSocialCardData[];
  username: string;
};

export async function SocialSection({ images }: { images: LandingImage[] }) {
  const liveFeed =
    process.env.NEXT_PUBLIC_USE_LIVE_SOCIAL_FEED === "true"
      ? await getLiveInstagramFeed()
      : null;
  const fallbackCards = buildFallbackSocialCards(images);

  const username = normalizeHandle(liveFeed?.username ?? INSTAGRAM_HANDLE);
  const socialCards = liveFeed?.cards.length ? liveFeed.cards : fallbackCards;
  const displayCards = socialCards.slice(0, 6);

  if (!displayCards.length) return null;

  return (
    <section className="overflow-hidden bg-[#FDF7F1] px-5 py-16 sm:px-6 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid min-w-0 gap-12 lg:grid-cols-[0.34fr_minmax(0,0.66fr)] lg:items-center">
          <div className="relative z-10 min-w-0">
            <div className="mb-6 inline-flex rounded-full border border-[#B39152]/35 bg-[#FFFCF8] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#74531B] shadow-[0_10px_28px_rgba(96,29,28,0.06)]">
              Social dispatch
            </div>

            <h2 className="max-w-[8ch] font-serif text-[clamp(4rem,9vw,8.4rem)] leading-[0.82] text-[#601D1C]">
              Seen in the Trunk.
            </h2>

            <p className="mt-7 w-full max-w-[calc(100vw-2.5rem)] text-base leading-7 text-[#601D1C]/70 sm:max-w-md">
              Reels from our restoration notes, new arrivals,
              and the women giving old-world sarees a new life.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit rounded-full bg-[#141D46] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#FDF7F1] shadow-[0_14px_34px_rgba(20,29,70,0.16)] transition hover:bg-[#0E0D0E]"
              >
                Follow @{username}
              </Link>
            </div>
          </div>

          <SocialReelCarousel cards={displayCards} username={username} />
        </div>
      </div>
    </section>
  );
}

async function getLiveInstagramFeed(): Promise<LiveSocialFeed | null> {
  const feedUrl = process.env.BEHOLD_FEED_URL;

  if (!feedUrl || feedUrl.includes("YOUR_FEED_ID")) return null;

  try {
    const response = await fetch(feedUrl, {
      next: {
        revalidate: 21600,
      },
    });

    if (!response.ok) {
      throw new Error(`Behold feed failed with ${response.status}`);
    }

    const feed = (await response.json()) as BeholdFeed;
    const cards = (feed.posts ?? [])
      .slice(0, 6)
      .map(normalizeBeholdPost)
      .filter((card): card is InstagramSocialCardData => Boolean(card));

    return {
      cards,
      username: normalizeHandle(feed.username ?? INSTAGRAM_HANDLE),
    };
  } catch (error) {
    console.warn("[FTT] Instagram feed unavailable:", error);
    return null;
  }
}

function normalizeBeholdPost(
  post: BeholdPost,
): InstagramSocialCardData | null {
  const child = post.mediaType === "CAROUSEL_ALBUM" ? post.children?.[0] : null;
  const visualPost = child ?? post;

  const image =
    visualPost.sizes?.large?.mediaUrl ??
    visualPost.sizes?.medium?.mediaUrl ??
    post.sizes?.large?.mediaUrl ??
    post.sizes?.medium?.mediaUrl ??
    visualPost.thumbnailUrl ??
    post.thumbnailUrl ??
    visualPost.mediaUrl ??
    post.mediaUrl;

  if (!image || !post.permalink) return null;

  const isVideo =
    post.mediaType === "VIDEO" ||
    visualPost.mediaType === "VIDEO" ||
    Boolean(post.isReel);
  const videoUrl =
    isVideo && (post.mediaUrl || visualPost.mediaUrl)
      ? (post.mediaUrl ?? visualPost.mediaUrl)
      : undefined;
  const caption = truncateCaption(
    post.prunedCaption ?? post.caption ?? "A story from the trunk.",
  );

  return {
    alt: post.altText ?? caption,
    caption,
    href: post.permalink,
    id: post.id,
    image,
    isCarousel: post.mediaType === "CAROUSEL_ALBUM",
    isVideo,
    label: post.isReel
      ? "Reel"
      : post.mediaType === "CAROUSEL_ALBUM"
        ? "Carousel"
        : "Instagram",
    placeholderColor: toRgbColor(
      post.colorPalette?.mutedDark ??
        post.colorPalette?.dominant ??
        visualPost.colorPalette?.mutedDark ??
        visualPost.colorPalette?.dominant,
    ),
    videoUrl,
  };
}

function buildFallbackSocialCards(
  images: LandingImage[],
): InstagramSocialCardData[] {
  return buildFallbackCards(images)
    .slice(0, 6)
    .map((card, index) => ({
      alt: card.caption,
      caption: card.caption,
      href: INSTAGRAM_URL,
      id: `fallback-social-${index}`,
      image: card.image,
      isCarousel: false,
      isVideo: true,
      label: card.label,
      placeholderColor: "#601D1C",
    }));
}

function buildFallbackCards(images: LandingImage[]) {
  const captions = [
    ["RESTORATION", "Before the drape returns to the wardrobe."],
    ["STYLING", "One saree, many ways to carry presence."],
    ["PROVENANCE", "The detail that makes a piece remembered."],
    ["NEW ARRIVAL", "A quiet statement from the trunk."],
    ["CARE", "Pressed, checked, folded, and ready."],
    ["ARCHIVE", "A restored saree finding its next story."],
  ];

  return fillImages(images).map((image, index) => ({
    caption: captions[index]?.[1] ?? "A restored saree finding its next story.",
    image: image.src,
    label: captions[index]?.[0] ?? "SOCIAL",
  }));
}

function fillImages(images: LandingImage[]) {
  const merged = [...images];
  for (const [index, src] of FALLBACK_IMAGES.entries()) {
    if (merged.length >= 6) break;
    merged.push({
      alt: "Curated saree from From The Trunk",
      src,
      title: ["Authenticated", "Restored", "Styled", "Archived", "Re-loved"][
        index
      ],
    });
  }

  return merged.slice(0, 6);
}

function truncateCaption(value: string, maxLength = 92): string {
  const cleaned = value
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) return cleaned;

  return `${cleaned.slice(0, maxLength).trim()}...`;
}

function toRgbColor(value?: string): string {
  if (!value) return "#601D1C";

  if (/^\d{1,3},\d{1,3},\d{1,3}$/.test(value.replace(/\s/g, ""))) {
    return `rgb(${value})`;
  }

  return value;
}

function normalizeHandle(value: string): string {
  return value.replace(/^@/, "").trim() || "from.thetrunk";
}
