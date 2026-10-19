import { redirect } from "next/navigation";
import { listUserOrganizations, requireUser } from "@/lib/auth/session";

/** Entry point after login: go to the last active org, the only org, or onboarding. */
export default async function OrgIndexPage() {
  const user = await requireUser("/o");
  const orgs = await listUserOrganizations(user.id);

  if (orgs.length === 0) redirect("/onboarding");
  const target = orgs.find((o) => o.id === user.lastActiveOrgId) ?? orgs[0];
  redirect(`/o/${target.slug}/dashboard`);
}
