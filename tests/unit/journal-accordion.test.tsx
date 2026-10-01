// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JournalAccordion } from "@/components/journal/journal-accordion";
import { JournalArticleBody } from "@/components/journal/journal-article-body";
import { JournalFaq } from "@/components/journal/journal-article-sections";
import {
  JOURNAL_EXPANDABLE_SECTIONS,
  journalFaqItemIds,
  segmentJournalBody,
} from "@/lib/journal/accordion";
import { getPublishedJournalArticle, getPublishedJournalArticles, getJournalLinkResolver } from "@/lib/journal/articles";
import type { JournalArticle, JournalRenderBlock } from "@/lib/journal/derive";
import { inlineToPlainText } from "@/lib/journal/inline";
import { smartApostrophes } from "@/lib/journal/text";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FAQ_SLUGS = [
  "preloved-sarees-meaning",
  "how-to-identify-pure-silk-saree",
  "how-to-care-for-silk-sarees",
  "where-to-sell-old-silk-sarees",
];
const CARE = "how-to-care-for-sarees";
const FABRICS = ["Silk", "Handloom cotton", "Chiffon", "Georgette", "Organza", "Linen"];

/** What JournalInline displays for a JSON string: markup stripped, apostrophes curled. */
const shown = (text: string) => smartApostrophes(inlineToPlainText(text));
const squash = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

function article(slug: string): JournalArticle {
  const found = getPublishedJournalArticle(slug);
  if (!found) throw new Error(`missing ${slug}`);
  return found;
}

function parse(html: string) {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("segmentJournalBody", () => {
  it("groups Blog 8's fabric subsections under their H2, keeping every block and index", () => {
    const { body } = article(CARE);
    const segments = segmentJournalBody(body, JOURNAL_EXPANDABLE_SECTIONS[CARE]);
    const groups = segments.filter((segment) => segment.kind === "subsections");
    expect(groups).toHaveLength(1);
    const [group] = groups;
    if (group?.kind !== "subsections") throw new Error("no group");
    expect(group.subsections.map(({ heading }) => [heading.text, heading.level])).toEqual(
      FABRICS.map((fabric) => [fabric, 3]),
    );
    const chiffon = group.subsections.find(({ heading }) => heading.id === "chiffon");
    expect(chiffon?.blocks.at(-1)?.block.type).toBe("figure");

    // Nothing is lost or reordered: the segments cover the body exactly once.
    const covered = segments.flatMap((segment) =>
      segment.kind === "block"
        ? [segment.index]
        : segment.subsections.flatMap(({ heading, blocks }) => [body.indexOf(heading), ...blocks.map(({ index }) => index)]),
    );
    expect(covered).toEqual(body.map((_, index) => index));
  });

  it("leaves every other article, and an unclean section, as plain blocks", () => {
    for (const { slug, body } of getPublishedJournalArticles()) {
      if (slug === CARE) continue;
      expect(JOURNAL_EXPANDABLE_SECTIONS[slug]).toBeUndefined();
      expect(segmentJournalBody(body, JOURNAL_EXPANDABLE_SECTIONS[slug]).every((s) => s.kind === "block")).toBe(true);
    }
    const unclean: JournalRenderBlock[] = [
      { type: "heading", id: "care", text: "Care", level: 2 },
      { type: "paragraph", text: "Intro before the subsections." },
      { type: "heading", id: "silk", text: "Silk", level: 3 },
      { type: "paragraph", text: "Silk care." },
      { type: "heading", id: "linen", text: "Linen", level: 3 },
      { type: "paragraph", text: "Linen care." },
    ];
    expect(segmentJournalBody(unclean, "care").every((s) => s.kind === "block")).toBe(true);
    expect(segmentJournalBody(unclean.filter((_, i) => i !== 1), "care").some((s) => s.kind === "subsections")).toBe(true);
    expect(segmentJournalBody(unclean, "missing").every((s) => s.kind === "block")).toBe(true);
  });
});

describe("journalFaqItemIds", () => {
  it("gives every question a unique id clear of the body's heading ids", () => {
    for (const slug of FAQ_SLUGS) {
      const story = article(slug);
      const ids = journalFaqItemIds(story);
      const headings = story.body.flatMap((block) => (block.type === "heading" ? [block.id] : []));
      expect(ids).toHaveLength(story.faq?.items.length ?? 0);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(headings).not.toContain(id);
    }
    // "Which old sarees are worth the most?" is also a body H2 in Blog 4.
    expect(journalFaqItemIds(article("where-to-sell-old-silk-sarees"))).toContain("which-old-sarees-are-worth-the-most-2");
    expect(journalFaqItemIds(article("preloved-sarees-meaning"))[0]).toBe("what-does-preloved-mean");
  });
});

describe("server-rendered accordion text", () => {
  const resolveLink = getJournalLinkResolver();

  it.each(FAQ_SLUGS)("%s renders every question and answer exactly, closed, as H3s under the H2", (slug) => {
    const story = article(slug);
    const faq = story.faq!;
    const ids = journalFaqItemIds(story);
    const host = parse(renderToStaticMarkup(<JournalFaq faq={faq} itemIds={ids} resolveLink={resolveLink} />));

    expect(host.querySelector("h2#journal-faq")?.textContent).toBe(faq.heading);
    const rows = [...host.querySelectorAll<HTMLElement>("[data-journal-accordion-item]")];
    expect(rows).toHaveLength(faq.items.length);
    faq.items.forEach((item, index) => {
      const row = rows[index];
      const heading = row.querySelector("h3");
      const button = heading?.querySelector("button");
      const panel = row.querySelector<HTMLElement>("[role=region]");
      expect(heading?.id).toBe(ids[index]);
      expect(squash(button?.textContent)).toBe(shown(item.question));
      expect(squash(panel?.textContent)).toBe(shown(item.answer));
      expect(button?.getAttribute("aria-expanded")).toBe("false");
      expect(button?.getAttribute("aria-controls")).toBe(panel?.id);
      expect(panel?.getAttribute("aria-labelledby")).toBe(button?.id);
      expect(panel?.getAttribute("data-state")).toBe("closed");
      expect(button?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    });
    expect(host.innerHTML).not.toContain("FAQPage");
  });

  it("renders Blog 8's fabric paragraphs and figure inside their cards, the rest of the body open", () => {
    const story = article(CARE);
    const host = parse(
      renderToStaticMarkup(
        <JournalArticleBody body={story.body} resolveLink={resolveLink} expandableSectionId={JOURNAL_EXPANDABLE_SECTIONS[CARE]} />,
      ),
    );
    const rows = [...host.querySelectorAll<HTMLElement>("[data-journal-accordion-item]")];
    expect(rows.map((row) => squash(row.querySelector("h3 button")?.textContent))).toEqual(FABRICS);
    expect(host.querySelector("h2#how-do-you-care-for-each-saree-fabric")?.closest("[data-journal-accordion-item]")).toBeNull();

    const segments = segmentJournalBody(story.body, JOURNAL_EXPANDABLE_SECTIONS[CARE]);
    const group = segments.find((segment) => segment.kind === "subsections");
    if (group?.kind !== "subsections") throw new Error("no group");
    group.subsections.forEach(({ heading, blocks }) => {
      const panel = host.querySelector<HTMLElement>(`#${heading.id}-panel`);
      const paragraphs = [...(panel?.querySelectorAll("p") ?? [])].map((p) => squash(p.textContent));
      expect(paragraphs).toEqual(
        blocks.flatMap(({ block }) => (block.type === "paragraph" ? [shown(block.text)] : [])),
      );
    });
    expect(host.querySelector("#chiffon-panel figure img")).not.toBeNull();

    // Every other paragraph stays outside any panel.
    const outside = [...host.querySelectorAll("p")].filter((p) => !p.closest("[role=region]")).map((p) => squash(p.textContent));
    const inGroup = new Set(group.subsections.flatMap(({ blocks }) => blocks.map(({ index }) => index)));
    expect(outside).toEqual(
      story.body.flatMap((block, index) => (block.type === "paragraph" && !inGroup.has(index) ? [shown(block.text)] : [])),
    );
  });
});

describe("JournalAccordion in the browser", () => {
  const items = [
    { id: "first-question", label: "First question?", content: <p>First answer.</p> },
    { id: "second-question", label: "Second question?", content: <p>Second answer.</p> },
  ];
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // jsdom has no layout, so no scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
  });

  const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("h3 > button")];
  const panel = (id: string) => container.querySelector<HTMLElement>(`#${id}-panel`)!;
  const toggleAll = () => container.querySelector<HTMLButtonElement>(".journal-accordion-toggle-all button")!;

  it("starts closed with panels until-found, and toggles aria-expanded on click", () => {
    act(() => root.render(<JournalAccordion items={items} />));
    expect(container.querySelector(".journal-accordion")?.hasAttribute("data-ready")).toBe(true);
    expect(buttons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
    expect(panel("first-question").getAttribute("hidden")).toBe("until-found");
    expect(panel("first-question").textContent).toBe("First answer.");

    act(() => buttons()[0].click());
    expect(buttons()[0].getAttribute("aria-expanded")).toBe("true");
    expect(panel("first-question").hasAttribute("hidden")).toBe(false);
    expect(panel("first-question").getAttribute("data-state")).toBe("open");
    expect(buttons()[1].getAttribute("aria-expanded")).toBe("false");

    act(() => buttons()[0].click());
    expect(buttons()[0].getAttribute("aria-expanded")).toBe("false");
    expect(panel("first-question").getAttribute("hidden")).toBe("until-found");
  });

  it("opens the row a URL hash points at, on load and on hashchange", () => {
    window.history.replaceState(null, "", "/#second-question");
    act(() => root.render(<JournalAccordion items={items} />));
    expect(buttons()[1].getAttribute("aria-expanded")).toBe("true");
    expect(panel("second-question").hasAttribute("hidden")).toBe(false);
    expect(buttons()[0].getAttribute("aria-expanded")).toBe("false");

    act(() => {
      window.history.replaceState(null, "", "/#first-question");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(buttons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
  });

  it("opens a row when find-in-page reveals it (beforematch)", () => {
    act(() => root.render(<JournalAccordion items={items} />));
    act(() => {
      panel("second-question").dispatchEvent(new Event("beforematch"));
    });
    expect(buttons()[1].getAttribute("aria-expanded")).toBe("true");
  });

  it("shows and hides every row with Show all / Hide all", () => {
    act(() => root.render(<JournalAccordion items={items} variant="card" />));
    expect(toggleAll().textContent).toBe("Show all");
    expect(toggleAll().getAttribute("aria-expanded")).toBe("false");

    act(() => toggleAll().click());
    expect(buttons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
    expect(items.every(({ id }) => !panel(id).hasAttribute("hidden"))).toBe(true);
    expect(toggleAll().textContent).toBe("Hide all");

    act(() => toggleAll().click());
    expect(buttons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
    expect(items.every(({ id }) => panel(id).getAttribute("hidden") === "until-found")).toBe(true);
    expect(toggleAll().textContent).toBe("Show all");

    // Opening each row by hand also flips the control.
    for (const button of buttons()) act(() => button.click());
    expect(toggleAll().textContent).toBe("Hide all");
  });
});
