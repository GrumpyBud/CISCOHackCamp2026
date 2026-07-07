import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccountAgeDays, getResearchConsent, getResearchProfile, setResearchConsent, setResearchProfile } from "@/lib/research";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const consent = await getResearchConsent(userId);
    const profile = await getResearchProfile(userId);
    let accountAgeDays: number | null = null;
    try {
      accountAgeDays = await getAccountAgeDays(userId);
    } catch (error) {
      console.error("Research account age lookup failed", error);
    }
    return NextResponse.json({ consent, profile: { ...profile, account_age_days: profile.account_age_days ?? accountAgeDays ?? null } });
  } catch (error) {
    console.error("Research consent load failed", error);
    return NextResponse.json({
      error: "Could not load research settings",
      consent: { enabled: true, updated_at: "" },
      profile: { age_years: null, account_age_days: null, gender: "", handedness: "", notes: "", updated_at: "" },
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const consent = await setResearchConsent(userId, Boolean((body as { enabled?: boolean }).enabled));
    let accountAgeDays: number | null = null;
    try {
      accountAgeDays = await getAccountAgeDays(userId);
    } catch (error) {
      console.error("Research account age lookup failed", error);
    }
    const profile = await setResearchProfile(userId, {
      age_years: (body as { profile?: { age_years?: string | number | null } }).profile?.age_years !== "" ? Number((body as { profile?: { age_years?: string | number | null } }).profile?.age_years ?? 0) || null : null,
      account_age_days: accountAgeDays ?? null,
      gender: (body as { profile?: { gender?: string | null } }).profile?.gender || null,
      handedness: (body as { profile?: { handedness?: string | null } }).profile?.handedness || null,
      notes: (body as { profile?: { notes?: string | null } }).profile?.notes || null,
    });
    return NextResponse.json({ consent, profile });
  } catch (error) {
    console.error("Research consent save failed", error);
    return NextResponse.json({
      error: "Could not save research settings",
      consent: { enabled: true, updated_at: "" },
      profile: { age_years: null, account_age_days: null, gender: "", handedness: "", notes: "", updated_at: "" },
    }, { status: 500 });
  }
}
