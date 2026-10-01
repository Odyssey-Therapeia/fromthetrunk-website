import Image from "next/image";
import type { ReactNode } from "react";

import { JournalAccordion } from "@/components/journal/journal-accordion";
import { JournalInline } from "@/components/journal/journal-inline";
import { segmentJournalBody } from "@/lib/journal/accordion";
import type { JournalRenderBlock } from "@/lib/journal/derive";
import type { JournalLinkResolver } from "@/lib/journal/links";
import { cn } from "@/lib/utils";

type Block<T extends JournalRenderBlock["type"]> = Extract<JournalRenderBlock, { type: T }>;

type BlockProps<T extends JournalRenderBlock["type"]> = {
  block: Block<T>;
  resolveLink: JournalLinkResolver;
};

/** Body 17/30 → 18/32, set to ~40rem so lines stay near 70 characters. */
const paragraphClass = "max-w-[40rem] text-[1.0625rem] leading-[1.875rem] text-journal-navy @xl:text-lg @xl:leading-8";

function Paragraph({ block, resolveLink, lede }: BlockProps<"paragraph"> & { lede: boolean }) {
  return (
    <p
      className={cn(
        paragraphClass,
        lede && "text-[1.1875rem] leading-[1.875rem] @xl:text-xl @xl:leading-8",
      )}
    >
      <JournalInline text={block.text} resolveLink={resolveLink} />
    </p>
  );
}

function Heading({ block, resolveLink }: BlockProps<"heading">) {
  const Tag = block.level === 3 ? "h3" : "h2";
  return (
    <Tag
      id={block.id}
      className={cn(
        "max-w-[40rem] scroll-mt-32 text-balance font-journal-serif font-semibold text-journal-navy",
        block.level === 3
          ? "mt-9 text-[1.375rem] leading-7 @xl:text-2xl @xl:leading-[1.875rem]"
          : "mt-12 text-[1.625rem] font-medium leading-8 before:mb-4 before:block before:h-px before:w-10 before:bg-journal-gold before:content-[''] @xl:mt-14 @xl:text-[2rem] @xl:leading-9",
      )}
    >
      <JournalInline text={block.text} resolveLink={resolveLink} />
    </Tag>
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
        "list-decimal space-y-3 pl-8 marker:font-journal-serif marker:font-semibold marker:text-[1.1em]",
      )}
    >
      {items}
    </ol>
  ) : (
    <ul className={cn(paragraphClass, "list-disc space-y-3 pl-7 marker:text-journal-gold")}>{items}</ul>
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
        <table aria-labelledby={labelledBy} className="w-full border-collapse text-left text-[0.9375rem] leading-6 text-journal-navy">
          <thead>
            <tr className="border-b border-journal-navy/70">
              {block.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="pb-3 pr-6 align-bottom text-xs font-medium uppercase leading-4 tracking-[0.18em] text-journal-muted last:pr-0"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map(([rowHeader, ...cells], rowIndex) => (
              <tr key={rowIndex} className="border-b border-journal-gold/45">
                <th scope="row" className="py-4 pr-6 align-top font-journal-serif text-lg font-semibold leading-6 text-journal-navy">
                  <JournalInline text={rowHeader} resolveLink={resolveLink} />
                </th>
                {cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className="py-4 pr-6 align-top text-journal-navy last:pr-0">
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
          <li key={rowIndex} className="rounded-2xl border border-journal-navy/15 bg-journal-paper px-5 py-4">
            <p className="font-journal-serif text-xl font-semibold leading-6 text-journal-navy">
              <span className="sr-only">{rowHeaderColumn}: </span>
              <JournalInline text={rowHeader} resolveLink={resolveLink} />
            </p>
            <dl className="mt-3 grid gap-3 border-t border-journal-gold/45 pt-3 text-[0.9375rem] leading-6 text-journal-navy">
              {cells.map((cell, cellIndex) => (
                <div key={cellIndex}>
                  <dt className="text-xs font-medium uppercase leading-4 tracking-[0.18em] text-journal-muted">
                    {valueColumns[cellIndex]}
                  </dt>
                  <dd className="mt-1">
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
              "relative overflow-hidden rounded-[1.1rem] bg-journal-navy/10",
              pair ? "aspect-4/3 @md:aspect-4/5" : "aspect-4/3 @md:aspect-3/2",
            )}
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              quality={75}
              sizes={pair ? "(min-width: 768px) 346px, calc(100vw - 32px)" : "(min-width: 768px) 704px, calc(100vw - 32px)"}
              className="object-cover"
            />
          </div>
        ))}
      </div>
      {block.caption ? (
        <figcaption className="mt-3 text-sm leading-5 text-journal-muted">
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

/**
 * The article body: paragraphs, H2s, lists, tables and figures in order, on a
 * 44rem column. When `expandableSectionId` names an H2 with a clean run of H3
 * subsections, those subsections render as expandable cards under it, each
 * keeping its heading level, id and blocks.
 */
export function JournalArticleBody({
  body,
  resolveLink,
  afterLede,
  expandableSectionId,
}: {
  body: readonly JournalRenderBlock[];
  resolveLink: JournalLinkResolver;
  /** Rendered straight after the opening paragraph (the contents, below 1280px). */
  afterLede?: ReactNode;
  /** An H2 id from `JOURNAL_EXPANDABLE_SECTIONS`. */
  expandableSectionId?: string;
}) {
  const sectionHeadingIds = precedingHeadingIds(body);

  const renderBlock = (block: JournalRenderBlock, index: number): ReactNode[] => {
    switch (block.type) {
      case "paragraph":
        return index === 0 && afterLede
          ? [<Paragraph key={index} block={block} resolveLink={resolveLink} lede />, <div key="after-lede">{afterLede}</div>]
          : [<Paragraph key={index} block={block} resolveLink={resolveLink} lede={index === 0} />];
      case "heading":
        return [<Heading key={index} block={block} resolveLink={resolveLink} />];
      case "list":
        return [<List key={index} block={block} resolveLink={resolveLink} />];
      case "table":
        return [
          <Table
            key={index}
            block={block}
            resolveLink={resolveLink}
            labelledBy={sectionHeadingIds[index]}
          />,
        ];
      case "figure":
        return [<Figure key={index} block={block} resolveLink={resolveLink} />];
    }
  };

  const blocks: ReactNode[] = segmentJournalBody(body, expandableSectionId).flatMap<ReactNode>((segment) =>
    segment.kind === "block"
      ? renderBlock(segment.block, segment.index)
      : [
          <JournalAccordion
            key={`subsections-${segment.subsections[0].heading.id}`}
            variant="card"
            headingLevel={segment.subsections[0].heading.level}
            items={segment.subsections.map(({ heading, blocks: panel }) => ({
              id: heading.id,
              label: <JournalInline text={heading.text} resolveLink={resolveLink} />,
              content: <div className="space-y-5 *:last:mb-0">{panel.flatMap(({ block, index }) => renderBlock(block, index))}</div>,
            }))}
          />,
        ],
  );

  // space-y sets a zero-specificity bottom margin, so headings and figures can
  // widen the gap with their own margins (sibling margins collapse).
  return <div className="@container space-y-6">{blocks}</div>;
}
