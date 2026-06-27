import { NextRequest, NextResponse } from "next/server";

import { buildOrderReceiptHtml, formatOrderShortId } from "@/lib/orders/receipt-html";
import { getViewableOrder } from "@/lib/orders/viewable-order";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId");
  const accessKey = request.nextUrl.searchParams.get("key");

  try {
    const order = await getViewableOrder(orderId, accessKey);
    if (!order) {
      return NextResponse.json({ message: "Receipt not found." }, { status: 404 });
    }

    const shortId = formatOrderShortId(order.id);
    return new NextResponse(buildOrderReceiptHtml(order), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="ftt-receipt-${shortId}.html"`,
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("Failed to generate order receipt", error);
    return NextResponse.json({ message: "Receipt unavailable." }, { status: 500 });
  }
}
