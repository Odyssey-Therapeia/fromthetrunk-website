"use client";

import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { JournalIndexView } from "@/components/journal/journal-index-view";
import { JOURNAL_PATH } from "@/lib/journal/constants";
import type { JournalCardData } from "@/lib/journal/derive";
import { filterJournalSearch, journalSearchTerms, type JournalSearchEntry } from "@/lib/journal/search";

const URL_SYNC_DELAY_MS = 300;

type JournalIndexSearchProps = {
  articles: readonly JournalCardData[];
  entries: readonly JournalSearchEntry[];
  intro: ReactNode;
};

function journalSearchUrl(query: string): string {
  const trimmed = query.trim();
  return trimmed ? `${JOURNAL_PATH}?${new URLSearchParams({ q: trimmed }).toString()}` : JOURNAL_PATH;
}

/**
 * Client-side search over the statically rendered index. The list filters as
 * the reader types and `?q=` follows along (replaceState, so typing does not
 * fill the history), which keeps searches shareable and restores them on
 * reload or back navigation. Before hydration the same view renders with a
 * plain GET form.
 */
export function JournalIndexSearch({ articles, entries, intro }: JournalIndexSearchProps) {
  const searchParams = useSearchParams();
  const urlQuery = (searchParams.get("q") ?? "").trim();

  const [value, setValue] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  // The URL changed from outside (back/forward, a link to /journal?q=...).
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setValue(urlQuery);
  }

  const writeUrl = useCallback((query: string) => {
    const trimmed = query.trim();
    setSyncedQuery(trimmed);
    window.history.replaceState(null, "", journalSearchUrl(trimmed));
  }, []);

  useEffect(() => {
    if (value.trim() === syncedQuery) return;
    const timer = window.setTimeout(() => writeUrl(value), URL_SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [value, syncedQuery, writeUrl]);

  const hasTerms = journalSearchTerms(value).length > 0;
  const visible = useMemo(() => {
    if (!hasTerms) return articles;
    const matches = new Set(filterJournalSearch(entries, value));
    return articles.filter((article) => matches.has(article.slug));
  }, [articles, entries, hasTerms, value]);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    writeUrl(value);
    // Put the on-screen keyboard away so the results are visible.
    inputRef.current?.blur();
  };

  const onClear = () => {
    setValue("");
    writeUrl("");
    inputRef.current?.focus();
  };

  return (
    <JournalIndexView
      articles={visible}
      query={hasTerms ? value.trim() : ""}
      intro={intro}
      controls={{ value, onChange, onSubmit, onClear, inputRef }}
    />
  );
}
