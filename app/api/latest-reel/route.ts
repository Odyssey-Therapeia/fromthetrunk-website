import { NextResponse } from "next/server";

import { getLatestReel } from "@/lib/social/latest-reel";

export async function GET() {
  const reel = await getLatestReel();

  return NextResponse.json(reel);
}

