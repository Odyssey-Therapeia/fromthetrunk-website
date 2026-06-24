"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type CollectionPageSizeSelectProps = {
  defaultValue: number;
  options: readonly number[];
  value: number;
};

export function CollectionPageSizeSelect({
  defaultValue,
  options,
  value,
}: CollectionPageSizeSelectProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <label className="relative inline-flex shrink-0">
      <span className="sr-only">Items to show</span>
      <select
        value={value}
        onChange={(event) => {
          const nextValue = Number.parseInt(event.target.value, 10);
          const params = new URLSearchParams(searchParams.toString());

          params.delete("page");
          if (nextValue === defaultValue) {
            params.delete("perPage");
          } else {
            params.set("perPage", String(nextValue));
          }

          const qs = params.toString();
          router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
        }}
        className="h-10 min-w-[8.4rem] appearance-none rounded-full border border-[var(--ftt-border)] bg-[#FDF7F1]/80 py-0 pl-4 pr-8 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ftt-royal-navy)] outline-none transition hover:border-[var(--ftt-gold)]/60 focus-visible:border-[var(--ftt-royal-navy)]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            Show {option}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[var(--ftt-gold)]"
      >
        v
      </span>
    </label>
  );
}
