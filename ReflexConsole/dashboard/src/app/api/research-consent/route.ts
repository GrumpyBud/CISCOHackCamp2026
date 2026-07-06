import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getResearchConsent, setResearchConsent } from "@/lib/research";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const consent = await getResearchConsent(userId);
  return NextResponse.json({ consent });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const consent = await setResearchConsent(userId, Boolean(body.enabled));
  return NextResponse.json({ consent });
}
