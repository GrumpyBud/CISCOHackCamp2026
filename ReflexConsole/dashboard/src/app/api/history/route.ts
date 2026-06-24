import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = getSql();
  await sql`DELETE FROM devices WHERE clerk_user_id = ${userId}`;
  return NextResponse.json({ deleted: true });
}
