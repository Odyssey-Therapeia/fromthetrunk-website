import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { parseInline, type InlineNode } from "@/lib/journal/inline";
import type { JournalLinkResolver } from "@/lib/journal/links";
import { smartApostrophes } from "@/lib/journal/text";

const linkClass =
  "rounded-[2px] font-medium text-ftt-burgundy underline decoration-ftt-gold decoration-1 underline-offset-[5px] transition-colors hover:decoration-ftt-burgundy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ftt-gold";

function renderNodes(
  nodes: readonly InlineNode[],
  resolveLink: JournalLinkResolver,
  keyPrefix: string,
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}${index}`;

    if (node.type === "text") {
      return <Fragment key={key}>{smartApostrophes(node.value)}</Fragment>;
    }

    const children = renderNodes(node.children, resolveLink, `${key}.`);

    if (node.type === "strong") {
      return (
        <strong key={key} className="font-semibold text-ftt-navy">
          {children}
        </strong>
      );
    }

    if (node.type === "em") {
      return <em key={key}>{children}</em>;
    }

    const resolved = resolveLink(node.href);
    switch (resolved.kind) {
      case "internal":
        return (
          <Link key={key} href={resolved.href} className={linkClass}>
            {children}
          </Link>
        );
      case "anchor":
        return (
          <a key={key} href={resolved.href} className={linkClass}>
            {children}
          </a>
        );
      case "external":
        return (
          <a
            key={key}
            href={resolved.href}
            className={linkClass}
            rel="noopener noreferrer"
            target={resolved.newTab ? "_blank" : undefined}
          >
            {children}
            {resolved.newTab ? <span className="sr-only"> (opens in a new tab)</span> : null}
          </a>
        );
      case "unavailable":
        // The target article is not published yet: keep the words, drop the link.
        return <Fragment key={key}>{children}</Fragment>;
    }
  });
}

/**
 * Renders journal inline markup (`**bold**`, `*italic*`, `[text](href)`) as
 * React elements. Text is always rendered as text nodes, never as HTML.
 */
export function JournalInline({
  text,
  resolveLink,
}: {
  text: string;
  resolveLink: JournalLinkResolver;
}) {
  return <>{renderNodes(parseInline(text), resolveLink, "")}</>;
}
