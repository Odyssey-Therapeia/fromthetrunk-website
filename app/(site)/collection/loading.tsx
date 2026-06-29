export default function CollectionLoading() {
  return (
    <div className="min-h-[calc(100svh-8rem)] bg-[linear-gradient(135deg,#601D1C_0%,#141D46_62%,#0E0D0E_135%)] text-[#FDF7F1]">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:space-y-10 sm:px-6 sm:py-12 lg:space-y-12 lg:py-16">
      {/* Header skeleton */}
      <div className="space-y-4">
        <div className="h-3 w-24 animate-pulse rounded-full bg-[#B39152]/55" />
        <div className="h-10 w-80 max-w-full animate-pulse rounded-xl bg-[#FDF7F1]/18" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-full bg-[#FDF7F1]/14" />
      </div>

      {/* Filter bar skeleton */}
      <div className="rounded-2xl border border-[#FDF7F1]/14 bg-[#FDF7F1]/10 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.18)] backdrop-blur">
        <div className="space-y-3">
          <div className="h-3 w-20 animate-pulse rounded-full bg-[#B39152]/50" />
          <div className="h-6 w-64 max-w-full animate-pulse rounded-xl bg-[#FDF7F1]/16" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-7 w-16 animate-pulse rounded-full bg-[#FDF7F1]/14"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Product grid skeleton */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:gap-6 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2 sm:space-y-3">
            <div className="aspect-3/4 animate-pulse rounded-xl bg-[#FDF7F1]/18 sm:aspect-4/5 sm:rounded-2xl" />
            <div className="h-5 w-3/4 animate-pulse rounded-full bg-[#FDF7F1]/16" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-[#FDF7F1]/13" />
            <div className="h-4 w-1/4 animate-pulse rounded-full bg-[#B39152]/42" />
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
