import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getResearchSessions } from "@/lib/research";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const sessions = await getResearchSessions(userId);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Research data load failed", error);
    return NextResponse.json({ error: "Could not load research data" }, { status: 500 });
  }
}
