import { Dashboard } from "@/components/dashboard";

// This route renders user-scoped Clerk controls and must never be statically
// generated or shared between dashboard visitors.
export const dynamic = "force-dynamic";

export default function Home() {
  return <main><header className="topbar"><div><p className="eyebrow">REFLEX CONSOLE</p><h1>Brain health console</h1></div></header><Dashboard /></main>;
}
