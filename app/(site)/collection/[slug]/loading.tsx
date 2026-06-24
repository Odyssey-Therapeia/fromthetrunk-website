export default function ProductLoading() {
  return (
    <main className="bg-[#FDF7F1] pb-24 text-[#0E0D0E] md:pb-0">
      <div className="mx-auto w-full max-w-[1440px] space-y-7 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
        <div className="h-3 w-64 max-w-full rounded-full bg-[#E7DDD4]" />

        <section className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(300px,0.58fr)] md:items-stretch md:[--pdp-panel-height:min(72vh,760px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.58fr)] lg:gap-7 lg:[--pdp-panel-height:min(74vh,800px)]">
          <div className="h-full min-h-[30rem] rounded-[1.25rem] border border-[#E7DDD4] bg-[#FFFCF8] p-2 shadow-[0_18px_46px_rgba(20,29,70,0.07)] md:min-h-[var(--pdp-panel-height)]">
            <div className="grid h-full gap-2 md:grid-cols-[4.75rem_minmax(0,1fr)]">
              <div className="order-2 flex gap-2 overflow-hidden md:order-1 md:h-full md:flex-col">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-16 w-12 shrink-0 rounded-xl bg-[#E7DDD4]/70 sm:h-20 sm:w-16 md:h-22 md:w-full"
                  />
                ))}
              </div>
              <div className="order-1 h-[min(68vh,620px)] min-h-[27rem] animate-pulse rounded-[1.05rem] bg-[#E7DDD4]/70 md:order-2 md:h-full md:min-h-0" />
            </div>
          </div>

          <aside className="h-full rounded-[1.15rem] border border-[#E7DDD4] bg-[#FFFCF8]/88 p-4 shadow-[0_14px_38px_rgba(20,29,70,0.06)] md:min-h-[var(--pdp-panel-height)] lg:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="h-3 w-36 rounded-full bg-[#B39152]/35" />
                <div className="h-3 w-28 rounded-full bg-[#E7DDD4]" />
              </div>
              <div className="h-6 w-20 rounded-full bg-[#E7DDD4]" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-10 w-11/12 rounded-full bg-[#E7DDD4]" />
              <div className="h-10 w-8/12 rounded-full bg-[#E7DDD4]" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-13 rounded-xl border border-[#E7DDD4] bg-[#FDF7F1]"
                />
              ))}
            </div>
            <div className="mt-4 h-14 rounded-xl bg-[#E7DDD4]/70" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-15 rounded-xl border border-[#E7DDD4] bg-[#FDF7F1]"
                />
              ))}
            </div>
            <div className="mt-4 h-12 rounded-full bg-[#141D46]" />
            <div className="mt-4 rounded-[1rem] bg-[#141D46] p-3">
              <div className="h-4 w-2/3 rounded-full bg-white/15" />
              <div className="mt-2 h-4 w-1/2 rounded-full bg-white/15" />
              <div className="mt-2 h-4 w-3/5 rounded-full bg-white/15" />
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
