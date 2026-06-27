import { formatCurrency } from "@/lib/formatters";
import { getPublicAssetOrigin } from "@/lib/config/site";
import type { Order } from "@/types/domain";

const RECEIPT_TIME_ZONE = "Asia/Kolkata";
const FALLBACK_DATE_LABEL = "Date unavailable";

type ReceiptDateInput = Date | null | string | undefined;

export function formatOrderShortId(orderId: string) {
  return orderId.slice(0, 8).toUpperCase();
}

const toValidDate = (value: ReceiptDateInput) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function getOrderPlacedDate(order: Order) {
  return toValidDate(order.placedAt) ?? toValidDate(order.createdAt);
}

export function formatReceiptDate(date: ReceiptDateInput) {
  const validDate = toValidDate(date);
  if (!validDate) return FALLBACK_DATE_LABEL;

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: RECEIPT_TIME_ZONE,
  }).format(validDate);
}

export function formatOrderStatusLabel(status: Order["status"]) {
  const labels: Record<Order["status"], string> = {
    confirmed: "Confirmed",
    delivered: "Delivered",
    pending: "Preparing confirmation",
    shipped: "Shipped",
  };
  return labels[status] ?? status;
}

export function formatPaymentStatusLabel(status: Order["paymentStatus"]) {
  const labels: Record<Order["paymentStatus"], string> = {
    failed: "Needs review",
    paid: "Paid",
    pending: "Payment pending",
    refunded: "Refunded",
  };
  return labels[status] ?? status;
}

export function getShippingAddressLines(order: Order) {
  return [
    order.shippingName,
    order.shippingLine1,
    order.shippingLine2,
    [
      order.shippingCity,
      order.shippingState,
      order.shippingPostalCode,
    ]
      .filter(Boolean)
      .join(", "),
    order.shippingCountry,
  ].filter((line): line is string => Boolean(line));
}

const escapeHtml = (value: null | string | undefined) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const moneyFromPaise = (paise: number) => formatCurrency(paise / 100);

const paymentMethodLabel = (order: Order) => {
  if (order.paymentMethod) return order.paymentMethod;
  if (order.paymentGateway) return order.paymentGateway;
  return "Razorpay";
};

export function buildOrderReceiptHtml(order: Order, generatedAt = new Date()) {
  const shortId = formatOrderShortId(order.id);
  const placedDate = getOrderPlacedDate(order);
  const addressLines = getShippingAddressLines(order);
  const logoUrl = `${getPublicAssetOrigin()}/Ftt_logo_navbar.png`;
  const itemsHtml = order.items
    .map(
      (item) => `
        <tr>
          <td>
            <strong>${escapeHtml(item.name)}</strong>
            <span>Qty ${item.quantity}</span>
          </td>
          <td>${moneyFromPaise(item.pricePaise)}</td>
          <td>${item.quantity}</td>
          <td class="amount">${moneyFromPaise(item.pricePaise * item.quantity)}</td>
        </tr>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>FTT Receipt ${escapeHtml(shortId)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #2f2421;
        --muted: #7a625d;
        --line: #ead9c5;
        --paper: #fffaf4;
        --wash: #f8efe5;
        --brand: #711a1d;
        --gold: #b68a4a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--wash);
        color: var(--ink);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
      }
      main {
        max-width: 860px;
        margin: 32px auto;
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 40px;
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        border-bottom: 1px solid var(--line);
        padding-bottom: 24px;
      }
      h1, h2, h3, p { margin: 0; }
      h1 {
        font-family: Georgia, "Times New Roman", serif;
        font-size: 34px;
        font-weight: 400;
        letter-spacing: 0.01em;
      }
      h2 {
        font-family: Georgia, "Times New Roman", serif;
        font-size: 20px;
        font-weight: 400;
        margin-bottom: 12px;
      }
      .brand {
        color: var(--brand);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
      }
      .brand-mark {
        border-bottom: 1px solid var(--line);
        margin-bottom: 24px;
        padding-bottom: 20px;
        text-align: center;
      }
      .brand-mark img {
        display: block;
        height: auto;
        margin: 0 auto;
        max-width: 220px;
        width: 160px;
      }
      .meta {
        color: var(--muted);
        font-size: 13px;
        margin-top: 8px;
      }
      .status {
        align-self: flex-start;
        border: 1px solid #d9eddb;
        border-radius: 999px;
        background: #eef9ef;
        color: #176a35;
        font-size: 12px;
        font-weight: 700;
        padding: 8px 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        white-space: nowrap;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin: 28px 0;
      }
      .box {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 18px;
        background: #fffdf9;
      }
      .label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }
      .value {
        margin-top: 6px;
        font-weight: 700;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }
      th {
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.14em;
        text-align: left;
        text-transform: uppercase;
        border-bottom: 1px solid var(--line);
        padding: 10px 0;
      }
      td {
        border-bottom: 1px solid var(--line);
        padding: 14px 0;
        vertical-align: top;
        font-size: 14px;
      }
      td span {
        color: var(--muted);
        display: block;
        font-size: 12px;
        margin-top: 2px;
      }
      th:not(:first-child), td:not(:first-child) { text-align: right; }
      .amount { font-weight: 700; }
      .totals {
        margin-left: auto;
        margin-top: 18px;
        max-width: 320px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 7px 0;
        color: var(--muted);
        font-size: 14px;
      }
      .total {
        border-top: 1px solid var(--line);
        color: var(--ink);
        font-size: 18px;
        font-weight: 800;
        margin-top: 6px;
        padding-top: 12px;
      }
      .footer {
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 12px;
        margin-top: 32px;
        padding-top: 18px;
      }
      .print-action {
        display: flex;
        justify-content: flex-end;
        margin: 24px auto 0;
        max-width: 860px;
      }
      button {
        appearance: none;
        background: var(--brand);
        border: 0;
        border-radius: 999px;
        color: white;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        padding: 11px 18px;
      }
      @media (max-width: 720px) {
        main { margin: 0; border-radius: 0; padding: 24px; }
        header, .grid { grid-template-columns: 1fr; }
        header { flex-direction: column; }
        .status { align-self: flex-start; }
        th:nth-child(2), td:nth-child(2) { display: none; }
        .print-action { padding: 0 16px; }
      }
      @media print {
        body { background: white; }
        main { border: 0; border-radius: 0; margin: 0; max-width: none; padding: 0; }
        .print-action { display: none; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand-mark">
        <img src="${escapeHtml(logoUrl)}" alt="From the Trunk">
      </div>
      <header>
        <div>
          <p class="brand">From the Trunk</p>
          <h1>Order receipt</h1>
          <p class="meta">Receipt #${escapeHtml(shortId)} &middot; Order placed ${escapeHtml(formatReceiptDate(placedDate))}</p>
        </div>
        <p class="status">${escapeHtml(formatPaymentStatusLabel(order.paymentStatus))}</p>
      </header>

      <section class="grid" aria-label="Receipt summary">
        <div class="box">
          <p class="label">Order status</p>
          <p class="value">${escapeHtml(formatOrderStatusLabel(order.status))}</p>
        </div>
        <div class="box">
          <p class="label">Payment method</p>
          <p class="value">${escapeHtml(paymentMethodLabel(order))}</p>
        </div>
        <div class="box">
          <p class="label">Shipping method</p>
          <p class="value">${escapeHtml(order.shippingMethod || "Standard")}</p>
        </div>
        <div class="box">
          <p class="label">Generated</p>
          <p class="value">${escapeHtml(formatReceiptDate(generatedAt))}</p>
        </div>
      </section>

      <section>
        <h2>Items</h2>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="totals">
          <div class="row"><span>Subtotal</span><strong>${moneyFromPaise(order.subtotalPaise)}</strong></div>
          <div class="row"><span>Shipping</span><strong>${moneyFromPaise(order.shippingCostPaise)}</strong></div>
          <div class="row"><span>GST</span><strong>${moneyFromPaise(order.taxAmountPaise)}</strong></div>
          ${
            order.discountCode
              ? `<div class="row"><span>Discount code</span><strong>${escapeHtml(order.discountCode)}</strong></div>`
              : ""
          }
          <div class="row total"><span>Amount paid</span><strong>${moneyFromPaise(order.totalPaise)}</strong></div>
        </div>
      </section>

      <section class="grid">
        <div class="box">
          <p class="label">Ship to</p>
          ${addressLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        </div>
        <div class="box">
          <p class="label">Contact</p>
          ${order.shippingEmail ? `<p>${escapeHtml(order.shippingEmail)}</p>` : ""}
          ${order.shippingPhone ? `<p>${escapeHtml(order.shippingPhone)}</p>` : ""}
          ${order.paymentId ? `<p class="meta">Payment ID: ${escapeHtml(order.paymentId)}</p>` : ""}
          ${order.razorpayOrderId ? `<p class="meta">Razorpay link: ${escapeHtml(order.razorpayOrderId)}</p>` : ""}
        </div>
      </section>

      <p class="footer">
        Thank you for shopping with From the Trunk. This receipt confirms the order details recorded by FTT.
        For help, contact hello@fromthetrunk.shop with receipt #${escapeHtml(shortId)}.
      </p>
    </main>
    <div class="print-action">
      <button type="button" onclick="window.print()">Print or save as PDF</button>
    </div>
  </body>
</html>`;
}
