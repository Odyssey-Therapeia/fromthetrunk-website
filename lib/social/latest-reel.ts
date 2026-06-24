/**
 * Server-side helper that fetches the latest Instagram reel/video from the
 * Behold feed (same source as the homepage social section). Used by the floating
 * picture-in-picture player. Returns null when no feed is configured or no video
 * is found — the widget then simply doesn't render.
 *
 * Reuses the public `BEHOLD_FEED_URL` env + 6-hour ISR, matching
 * `components/sections/social-section.tsx`.
 */

export type LatestReel = {
  videoUrl: string;
  poster: string;
  href: string;
  caption: string;
};

type BeholdSize = { mediaUrl?: string };

type BeholdPost = {
  isReel?: boolean;
  mediaType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink?: string;
  caption?: string;
  prunedCaption?: string;
  sizes?: { large?: BeholdSize; medium?: BeholdSize };
};

type BeholdFeed = { posts?: BeholdPost[] };

const FEED_REVALIDATE_SECONDS = 21600; // 6 hours, matching the social section.

export async function getLatestReel(): Promise<LatestReel | null> {
  const feedUrl = process.env.BEHOLD_FEED_URL;
  if (!feedUrl || feedUrl.includes("YOUR_FEED_ID")) return null;

  try {
    const response = await fetch(feedUrl, {
      next: { revalidate: FEED_REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;

    const feed = (await response.json()) as BeholdFeed;
    // Posts are newest-first; take the first video/reel.
    const reel = (feed.posts ?? []).find(
      (post) => post.isReel || post.mediaType === "VIDEO",
    );
    if (!reel?.mediaUrl) return null;

    const poster =
      reel.sizes?.large?.mediaUrl ??
      reel.sizes?.medium?.mediaUrl ??
      reel.thumbnailUrl ??
      "";

    return {
      videoUrl: reel.mediaUrl,
      poster,
      href: reel.permalink ?? "",
      caption: reel.prunedCaption ?? reel.caption ?? "",
    };
  } catch {
    return null;
  }
}
