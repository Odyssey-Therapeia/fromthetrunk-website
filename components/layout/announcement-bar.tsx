import Link from "next/link";

export function AnnouncementBar() {
  return (
    <div className="border-b border-trunk-gold/25 bg-trunk-brown px-6 py-2 text-center text-xs text-amber-50">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 tracking-[0.15em] uppercase">
        <span>Grand Launch Week • Complimentary styling consult</span>
        <Link
          href="/collection"
          className="font-semibold text-amber-100 underline decoration-amber-200/70 underline-offset-4 transition hover:text-white"
        >
          Explore the Collection
        </Link>
      </p>
    </div>
  );
}
