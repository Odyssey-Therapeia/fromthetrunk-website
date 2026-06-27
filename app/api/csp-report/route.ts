import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return new NextResponse(null, {
    headers: {
      "Cache-Control": "no-store",
    },
    status: 204,
  });
}
