import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasAnyUser } from "@/lib/auth";
import { AppShell } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await hasAnyUser())) redirect("/setup");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <AppShell userName={user.name}>{children}</AppShell>;
}
