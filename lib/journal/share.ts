export type JournalShareTargetId = "whatsapp" | "pinterest" | "facebook" | "x" | "email";

export type JournalShareTarget = {
  id: JournalShareTargetId;
  label: string;
  href: string;
  /** Web intents open in a new tab; mailto hands off to the mail app. */
  newTab: boolean;
};

export type JournalShareInput = {
  /** Absolute article URL. */
  url: string;
  title: string;
  /** Absolute cover URL. Pinterest is offered only when there is one. */
  imageUrl?: string | null;
};

const encode = encodeURIComponent;

/** Share links for the fallback menu, in display order. */
export function journalShareTargets({ url, title, imageUrl }: JournalShareInput): JournalShareTarget[] {
  const targets: JournalShareTarget[] = [
    {
      id: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/?text=${encode(`${title} ${url}`)}`,
      newTab: true,
    },
  ];

  if (imageUrl) {
    targets.push({
      id: "pinterest",
      label: "Pinterest",
      href: `https://www.pinterest.com/pin/create/button/?url=${encode(url)}&media=${encode(imageUrl)}&description=${encode(title)}`,
      newTab: true,
    });
  }

  targets.push(
    {
      id: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encode(url)}`,
      newTab: true,
    },
    {
      id: "x",
      label: "X",
      href: `https://x.com/intent/post?text=${encode(title)}&url=${encode(url)}`,
      newTab: true,
    },
    {
      id: "email",
      label: "Email",
      href: `mailto:?subject=${encode(title)}&body=${encode(`${title}\n\n${url}`)}`,
      newTab: false,
    },
  );

  return targets;
}
