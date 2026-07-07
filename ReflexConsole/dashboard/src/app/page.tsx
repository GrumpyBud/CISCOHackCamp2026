import { Dashboard } from "@/components/dashboard";

// This route renders user-scoped controls and demo data, so keep it dynamic.
export const dynamic = "force-dynamic";

export default function Home() {
  return <Dashboard />;
}
