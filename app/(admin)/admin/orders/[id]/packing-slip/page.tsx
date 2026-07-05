import { notFound } from "next/navigation";

import { getOrder } from "@/db/queries/orders";
import { getServerAuthSession } from "@/lib/auth/get-session";
import { formatCurrency } from "@/lib/formatters";
import { formatSelectedOptions } from "@/lib/orders/selected-options";

import { PrintControls } from "./print-controls";

type PackingSlipPageProps = {
  params: Promise<{ id: string }>;
};

const formatShortId = (id: string) => id.slice(0, 8).toUpperCase();

const formatDate = (value: Date | null | string | undefined) => {
  if (!value) return "Not placed";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export default async function PackingSlipPage({ params }: PackingSlipPageProps) {
  const session = await getServerAuthSession();
  if (session?.user?.role !== "admin") {
    return notFound();
  }

  const { id } = await params;
  const order = await getOrder(id);
  if (!order) {
    return notFound();
  }

  return (
    <main className="min-h-screen bg-[#FDF7F1] p-6 text-[#141D46] print:bg-white">
      <section className="mx-auto max-w-3xl rounded-2xl border border-[#E7DDD4] bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E7DDD4] pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#B39152]">
              From the Trunk
            </p>
            <h1 className="mt-2 font-serif text-3xl text-[#601D1C]">
              Packing slip #{formatShortId(order.id)}
            </h1>
            <p className="mt-1 text-sm text-[#141D46]/60">
              {formatDate(order.placedAt ?? order.createdAt)}
            </p>
          </div>
          <PrintControls />
        </header>

        <section className="grid gap-6 border-b border-[#E7DDD4] py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-[#601D1C]/60">
              Ship to
            </h2>
            <div className="mt-3 space-y-1 text-sm leading-6">
              <p className="font-semibold text-[#141D46]">{order.shippingName}</p>
              <p>{order.shippingLine1}</p>
              {order.shippingLine2 ? <p>{order.shippingLine2}</p> : null}
              <p>
                {[order.shippingCity, order.shippingState, order.shippingPostalCode]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p>{order.shippingCountry}</p>
              {order.shippingPhone ? <p>{order.shippingPhone}</p> : null}
              {order.shippingEmail ? <p>{order.shippingEmail}</p> : null}
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-[#601D1C]/60">
              Order
            </h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt>Status</dt>
                <dd className="font-semibold capitalize">{order.status}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Payment</dt>
                <dd className="font-semibold capitalize">{order.paymentStatus}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Shipping</dt>
                <dd className="font-semibold capitalize">{order.shippingMethod}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Total</dt>
                <dd className="font-semibold">
                  {formatCurrency(order.totalPaise / 100)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="py-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-[#601D1C]/60">
            Items
          </h2>
          <div className="mt-4 divide-y divide-[#E7DDD4]">
            {order.items.map((item) => (
              <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-semibold text-[#141D46]">{item.name}</p>
                  {formatSelectedOptions(item.selectedOptions) ? (
                    <p className="text-sm font-semibold text-[#141D46]/70">
                      {formatSelectedOptions(item.selectedOptions)}
                    </p>
                  ) : null}
                  <p className="text-sm text-[#141D46]/60">Qty {item.quantity}</p>
                </div>
                <p className="font-semibold text-[#141D46]">
                  {formatCurrency((item.pricePaise * item.quantity) / 100)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-[#E7DDD4] pt-5 text-xs leading-5 text-[#141D46]/60">
          Final product condition, packaging, and tracking details should be
          confirmed before dispatch.
        </footer>
      </section>
    </main>
  );
}
