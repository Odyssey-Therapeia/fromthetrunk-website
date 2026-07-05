"use client";

export function PrintControls() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-[#141D46] px-4 py-2 text-sm font-semibold text-[#FDF7F1] print:hidden"
    >
      Print packing slip
    </button>
  );
}
