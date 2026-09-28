import Image from "next/image";
import type { ReactNode } from "react";

import { JournalInline } from "@/components/journal/journal-inline";
import type { JournalRenderBlock } from "@/lib/journal/derive";
import type { JournalLinkResolver } from "@/lib/journal/links";
import { cn } from "@/lib/utils";

type Block<T extends JournalRenderBlock["type"]> = Extract<JournalRenderBlock, { type: T }>;

type BlockProps<T extends JournalRenderBlock["type"]> = {
  block: Block<T>;
  resolveLink: JournalLinkResolver;
};

const paragraphClass = "text-[1.0625rem] leading-[1.8] text-foreground";

function Paragraph({ block, resolveLink, lede }: BlockProps<"paragraph"> & { lede: boolean }) {
  return (
    <p
      className={cn(
        paragraphClass,
        lede && "text-[1.1875rem] leading-[1.7] text-ftt-navy sm:text-[1.3125rem] sm:leading-[1.65]",
      )}
    >
      <JournalInline text={block.text} resolveLink={resolveLink} />
    </p>
  );
}

function Heading({ block, resolveLink }: BlockProps<"heading">) {
  return (
    <h2
      id={block.id}
      className="mt-14 scroll-mt-28 text-balance font-serif text-[1.65rem] leading-[1.15] text-ftt-navy before:mb-5 before:block before:h-px before:w-10 before:bg-ftt-gold before:content-[''] sm:mt-16 sm:text-[2rem]"
    >
      <JournalInline text={block.text} resolveLink={resolveLink} />
    </h2>
  );
}

function List({ block, resolveLink }: BlockProps<"list">) {
  const items = block.items.map((item, index) => (
    <li key={index} className="pl-2">
      <JournalInline text={item} resolveLink={resolveLink} />
    </li>
  ));

  return block.ordered ? (
    <ol
      className={cn(
        paragraphClass,
        "list-decimal space-y-3.5 pl-8 marker:font-serif marker:text-[1.15em] marker:text-ftt-burgundy",
      )}
    >
      {items}
    </ol>
  ) : (
    <ul className={cn(paragraphClass, "list-disc space-y-3 pl-7 marker:text-ftt-gold")}>{items}</ul>
  );
}

/**
 * Two renders of the same data: a hairline table when the column is wide
 * enough, and one card per row when it is not. The container query shows
 * exactly one, so the other is out of the accessibility tree and nothing
 * ever scrolls sideways.
 */
function Table({ block, resolveLink, labelledBy }: BlockProps<"table"> & { labelledBy?: string }) {
  const [rowHeaderColumn, ...valueColumns] = block.columns;

  return (
    <div className="@container">
      <div className="hidden @xl:block">
        <table aria-labelledby={labelledBy} className="w-full border-collapse text-left text-[0.9375rem] leading-6">
          <thead>
            <tr className="border-b border-ftt-navy/70">
              {block.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="pb-3 pr-6 align-bottom text-[10px] font-semibold uppercase tracking-[0.24em] text-ftt-burgundy/80 last:pr-0"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map(([rowHeader, ...cells], rowIndex) => (
              <tr key={rowIndex} className="border-b border-ftt-border">
                <th scope="row" className="py-4 pr-6 align-top font-serif text-[1.0625rem] font-normal text-ftt-navy">
                  <JournalInline text={rowHeader} resolveLink={resolveLink} />
                </th>
                {cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className="py-4 pr-6 align-top text-foreground last:pr-0">
                    <JournalInline text={cell} resolveLink={resolveLink} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-labelledby={labelledBy} className="grid gap-3 @xl:hidden">
        {block.rows.map(([rowHeader, ...cells], rowIndex) => (
          <li key={rowIndex} className="rounded-2xl border border-ftt-border bg-ftt-card px-5 py-4">
            <p className="font-serif text-lg leading-snug text-ftt-navy">
              <span className="sr-only">{rowHeaderColumn}: </span>
              <JournalInline text={rowHeader} resolveLink={resolveLink} />
            </p>
            <dl className="mt-3 grid gap-3 border-t border-ftt-border pt-3 text-[0.9375rem] leading-6">
              {cells.map((cell, cellIndex) => (
                <div key={cellIndex}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ftt-burgundy/80">
                    {valueColumns[cellIndex]}
                  </dt>
                  <dd className="mt-1 text-foreground">
                    <JournalInline text={cell} resolveLink={resolveLink} />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Figure({ block, resolveLink }: BlockProps<"figure">) {
  const pair = block.images.length === 2;

  return (
    <figure className="@container my-10 sm:my-12">
      <div className={cn("grid gap-3", pair && "@md:grid-cols-2")}>
        {block.images.map((image) => (
          <div
            key={image.src}
            className={cn(
              "relative overflow-hidden rounded-[1.1rem] bg-ftt-border/40",
              pair ? "aspect-4/3 @md:aspect-4/5" : "aspect-4/3 @md:aspect-3/2",
            )}
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              quality={75}
              sizes={pair ? "(min-width: 768px) 340px, 100vw" : "(min-width: 768px) 700px, 100vw"}
              className="object-cover"
            />
          </div>
        ))}
      </div>
      {block.caption ? (
        <figcaption className="mt-3 text-sm leading-6 text-ftt-burgundy/80">
          <JournalInline text={block.caption} resolveLink={resolveLink} />
        </figcaption>
      ) : null}
    </figure>
  );
}

/** For each block, the id of the H2 it sits under (tables take it as their label). */
function precedingHeadingIds(body: readonly JournalRenderBlock[]): (string | undefined)[] {
  const ids: (string | undefined)[] = [];
  body.forEach((block, index) => {
    ids.push(block.type === "heading" ? block.id : ids[index - 1]);
  });
  return ids;
}

/** The article body: paragraphs, H2s, lists, tables and figures in order. */
export function JournalArticleBody({
  body,
  resolveLink,
}: {
  body: readonly JournalRenderBlock[];
  resolveLink: JournalLinkResolver;
}) {
  const sectionHeadingIds = precedingHeadingIds(body);

  const blocks: ReactNode[] = body.map((block, index) => {
    switch (block.type) {
      case "paragraph":
        return <Paragraph key={index} block={block} resolveLink={resolveLink} lede={index === 0} />;
      case "heading":
        return <Heading key={index} block={block} resolveLink={resolveLink} />;
      case "list":
        return <List key={index} block={block} resolveLink={resolveLink} />;
      case "table":
        return (
          <Table
            key={index}
            block={block}
            resolveLink={resolveLink}
            labelledBy={sectionHeadingIds[index]}
          />
        );
      case "figure":
        return <Figure key={index} block={block} resolveLink={resolveLink} />;
    }
  });

  // space-y sets a zero-specificity bottom margin, so headings and figures can
  // widen the gap with their own margins (sibling margins collapse).
  return <div className="space-y-6">{blocks}</div>;
}
