import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JournalInline } from "@/components/journal/journal-inline";
import {
  InlineMarkupError,
  collectInlineHrefs,
  inlineToPlainText,
  parseInline,
} from "@/lib/journal/inline";
import { createJournalLinkResolver, resolveInlineHref } from "@/lib/journal/links";

describe("journal inline markup parser", () => {
  it("parses bold, italic and links into a tree", () => {
    expect(parseInline("A **bold** and *soft* [link](/collection).")).toEqual([
      { type: "text", value: "A " },
      { type: "strong", children: [{ type: "text", value: "bold" }] },
      { type: "text", value: " and " },
      { type: "em", children: [{ type: "text", value: "soft" }] },
      { type: "text", value: " " },
      { type: "link", href: "/collection", children: [{ type: "text", value: "link" }] },
      { type: "text", value: "." },
    ]);
  });

  it("supports emphasis inside links and bold-italic runs", () => {
    expect(parseInline("[**Shop** now](/collection)")).toEqual([
      {
        type: "link",
        href: "/collection",
        children: [
          { type: "strong", children: [{ type: "text", value: "Shop" }] },
          { type: "text", value: " now" },
        ],
      },
    ]);
    expect(inlineToPlainText("***Both*** at once")).toBe("Both at once");
  });

  it("keeps a trailing run-in comma inside bold, as the article uses it", () => {
    expect(inlineToPlainText("**The condition,** especially along the fold lines.")).toBe(
      "The condition, especially along the fold lines.",
    );
  });

  it("treats escaped markup characters as text, and rejects a bare stray asterisk", () => {
    expect(inlineToPlainText("Literal \\*stars\\* and \\[brackets\\]")).toBe(
      "Literal *stars* and [brackets]",
    );
    expect(inlineToPlainText("5 \\* 3 = 15")).toBe("5 * 3 = 15");
    expect(() => parseInline("5 * 3 = 15")).toThrow(InlineMarkupError);
  });

  it.each([
    ["an unclosed bold", "The **craft. Handwoven silk"],
    ["an unclosed italic", "A *soft line"],
    ["a link with no href", "See [the guide] for more"],
    ["an unclosed href", "See [the guide](/journal/x for more"],
    ["a stray closing bracket", "Price ] list"],
    ["a link inside a link", "[outer [inner](/a)](/b)"],
    ["empty bold", "Nothing **** here"],
    ["empty link text", "[](/collection)"],
    ["a javascript: href", "[click](javascript:alert(1))"],
    ["a protocol-relative href", "[x](//evil.example)"],
  ])("rejects %s", (_label, source) => {
    expect(() => parseInline(source)).toThrow(InlineMarkupError);
  });

  it("collects hrefs for link checks", () => {
    expect(collectInlineHrefs("[a](/journal/one) and [b](https://example.com)")).toEqual([
      "/journal/one",
      "https://example.com",
    ]);
  });
});

describe("journal inline rendering", () => {
  const resolveLink = createJournalLinkResolver(["preloved-sarees-meaning"]);
  const render = (text: string) =>
    renderToStaticMarkup(<JournalInline text={text} resolveLink={resolveLink} />);

  it("never turns article text into HTML", () => {
    const html = render('<script>alert("x")</script> <img src=x onerror=alert(1)> **bold**');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain('<strong class="font-semibold text-ftt-navy">bold</strong>');
  });

  it("renders internal, external and unpublished journal links correctly", () => {
    const html = render(
      "[Shop](/collection), [read](/journal/preloved-sarees-meaning), [soon](/journal/how-to-identify-pure-silk-saree), [out](https://example.com/a?b=1), [mail](mailto:hello@fromthetrunk.shop)",
    );

    expect(html).toContain('href="/collection"');
    expect(html).toContain('href="/journal/preloved-sarees-meaning"');
    // The unpublished article keeps its words but gets no link.
    expect(html).not.toContain("how-to-identify-pure-silk-saree");
    expect(html).toContain(", soon, ");
    expect(html).toMatch(/<a[^>]*href="https:\/\/example.com\/a\?b=1"[^>]*rel="noopener noreferrer"[^>]*target="_blank"/);
    expect(html).toContain("(opens in a new tab)");
    expect(html).toMatch(/<a[^>]*href="mailto:hello@fromthetrunk.shop"[^>]*rel="noopener noreferrer"/);
  });

  it("renders typographic apostrophes consistently", () => {
    expect(render("A weaver's time")).toBe("A weaver’s time");
  });
});

describe("journal link resolution", () => {
  const published = new Set(["preloved-sarees-meaning"]);

  it("links published journal articles and plain site paths", () => {
    expect(resolveInlineHref("/journal/preloved-sarees-meaning", published)).toEqual({
      kind: "internal",
      href: "/journal/preloved-sarees-meaning",
    });
    expect(resolveInlineHref("/journal/preloved-sarees-meaning#faq", published).kind).toBe(
      "internal",
    );
    expect(resolveInlineHref("/journal", published).kind).toBe("internal");
    expect(resolveInlineHref("/collection", published).kind).toBe("internal");
  });

  it("leaves missing or draft journal articles unlinked", () => {
    expect(resolveInlineHref("/journal/how-to-identify-pure-silk-saree", published)).toEqual({
      kind: "unavailable",
      href: "/journal/how-to-identify-pure-silk-saree",
    });
  });

  it("classifies anchors and external links", () => {
    expect(resolveInlineHref("#questions", published).kind).toBe("anchor");
    expect(resolveInlineHref("https://www.instagram.com/from.thetrunk/", published)).toEqual({
      kind: "external",
      href: "https://www.instagram.com/from.thetrunk/",
      newTab: true,
    });
    expect(resolveInlineHref("mailto:hello@fromthetrunk.shop", published)).toMatchObject({
      kind: "external",
      newTab: false,
    });
    expect(resolveInlineHref("javascript:alert(1)", published).kind).toBe("unavailable");
  });
});
