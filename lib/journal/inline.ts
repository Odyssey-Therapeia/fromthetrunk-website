/**
 * Inline markup for journal text.
 *
 * Supported: `**bold**`, `*italic*` and `[text](href)`. Everything else is
 * literal text. A backslash escapes the next markup character (`\*`, `\[`,
 * `\]`, `\\`), for the rare sentence that needs a literal asterisk or bracket.
 *
 * The parser returns a small tree that the renderer maps to React elements,
 * so article text never reaches `dangerouslySetInnerHTML`. Anything that is
 * not balanced, such as an unclosed `**`, a `[` with no matching `](href)` or
 * a link inside a link, throws `InlineMarkupError`. The content schema calls
 * the parser during validation, so bad markup fails the build.
 */

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] };

export class InlineMarkupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InlineMarkupError";
  }
}

type Frame =
  | { kind: "root"; children: InlineNode[] }
  | { kind: "strong"; children: InlineNode[]; start: number }
  | { kind: "em"; children: InlineNode[]; start: number }
  | { kind: "link"; children: InlineNode[]; start: number };

const ESCAPABLE = new Set(["\\", "*", "[", "]"]);

const ALLOWED_HREF = /^(?:\/(?!\/)[^\s]*|#[^\s]+|https?:\/\/[^\s]+|mailto:[^\s]+)$/;

function isWhitespace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

function describe(kind: Frame["kind"]): string {
  if (kind === "strong") return "bold (**)";
  if (kind === "em") return "italic (*)";
  if (kind === "link") return "link ([)";
  return "text";
}

function pushText(frame: Frame, value: string) {
  if (!value) return;
  const last = frame.children[frame.children.length - 1];
  if (last?.type === "text") {
    last.value += value;
  } else {
    frame.children.push({ type: "text", value });
  }
}

/** Returns the index of the `)` that closes a link href starting at `from`. */
function findHrefEnd(source: string, from: number): number {
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (char === ")") return index;
    if (char === "(" || /\s/.test(char)) return -1;
  }
  return -1;
}

export function isAllowedInlineHref(href: string): boolean {
  return ALLOWED_HREF.test(href);
}

export function parseInline(source: string): InlineNode[] {
  const stack: Frame[] = [{ kind: "root", children: [] }];
  const top = () => stack[stack.length - 1];
  let index = 0;

  const close = (kind: "strong" | "em") => {
    const frame = stack.pop();
    if (!frame || frame.kind !== kind) {
      throw new InlineMarkupError(`Unbalanced ${describe(kind)} in "${source}".`);
    }
    if (frame.children.length === 0) {
      throw new InlineMarkupError(`Empty ${describe(kind)} in "${source}".`);
    }
    top().children.push({ type: kind, children: frame.children });
  };

  while (index < source.length) {
    const char = source[index];

    if (char === "\\" && ESCAPABLE.has(source[index + 1] ?? "")) {
      pushText(top(), source[index + 1]);
      index += 2;
      continue;
    }

    if (char === "*") {
      let run = 0;
      while (source[index + run] === "*") run += 1;
      if (run > 3) {
        throw new InlineMarkupError(`Too many asterisks at position ${index} in "${source}".`);
      }

      const canClose = !isWhitespace(source[index - 1]);
      const canOpen = !isWhitespace(source[index + run]);
      let remaining = run;

      if (canClose) {
        while (remaining > 0) {
          const current = top();
          if (current.kind === "strong" && remaining >= 2) {
            close("strong");
            remaining -= 2;
          } else if (current.kind === "em") {
            close("em");
            remaining -= 1;
          } else {
            break;
          }
        }
      }

      if (remaining > 0) {
        if (!canOpen) {
          throw new InlineMarkupError(
            `Unbalanced asterisk at position ${index} in "${source}".`,
          );
        }
        if (remaining >= 2) {
          stack.push({ kind: "strong", children: [], start: index });
          remaining -= 2;
        }
        if (remaining === 1) {
          stack.push({ kind: "em", children: [], start: index });
        }
      }

      index += run;
      continue;
    }

    if (char === "[") {
      if (stack.some((frame) => frame.kind === "link")) {
        throw new InlineMarkupError(`Links cannot contain links in "${source}".`);
      }
      stack.push({ kind: "link", children: [], start: index });
      index += 1;
      continue;
    }

    if (char === "]") {
      const frame = top();
      if (frame.kind !== "link") {
        const open = stack.some((item) => item.kind === "link");
        throw new InlineMarkupError(
          open
            ? `Formatting inside a link must close before "]" in "${source}".`
            : `Unexpected "]" at position ${index} in "${source}".`,
        );
      }
      if (source[index + 1] !== "(") {
        throw new InlineMarkupError(
          `Link text must be followed by "(href)" at position ${index} in "${source}".`,
        );
      }
      const hrefEnd = findHrefEnd(source, index + 2);
      if (hrefEnd === -1) {
        throw new InlineMarkupError(`Unclosed link href at position ${index} in "${source}".`);
      }
      const href = source.slice(index + 2, hrefEnd);
      if (!isAllowedInlineHref(href)) {
        throw new InlineMarkupError(
          `Link href "${href}" must be a site path, #anchor, http(s) or mailto URL.`,
        );
      }
      if (frame.children.length === 0) {
        throw new InlineMarkupError(`Empty link text for "${href}" in "${source}".`);
      }
      stack.pop();
      top().children.push({ type: "link", href, children: frame.children });
      index = hrefEnd + 1;
      continue;
    }

    let next = index + 1;
    while (next < source.length && !"\\*[]".includes(source[next])) next += 1;
    pushText(top(), source.slice(index, next));
    index = next;
  }

  if (stack.length > 1) {
    const unclosed = stack[stack.length - 1];
    throw new InlineMarkupError(`Unclosed ${describe(unclosed.kind)} in "${source}".`);
  }

  return stack[0].children;
}

export function inlineNodesToText(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => (node.type === "text" ? node.value : inlineNodesToText(node.children)))
    .join("");
}

/** Plain visible text for a markup string (used for search, word counts and ids). */
export function inlineToPlainText(source: string): string {
  return inlineNodesToText(parseInline(source));
}

export function collectInlineHrefs(source: string): string[] {
  const hrefs: string[] = [];
  const walk = (nodes: readonly InlineNode[]) => {
    for (const node of nodes) {
      if (node.type === "link") hrefs.push(node.href);
      if (node.type !== "text") walk(node.children);
    }
  };
  walk(parseInline(source));
  return hrefs;
}
