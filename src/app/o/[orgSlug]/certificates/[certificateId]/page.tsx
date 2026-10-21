import { CircleAlertIcon, ExternalLinkIcon, FileTextIcon, FlagIcon, OctagonAlertIcon, PencilIcon, ShieldCheckIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DismissFlagDialog, RejectDialog, TransitionButton } from "@/features/certificates/controls";
import { FLAG_LABELS, TYPE_LABELS } from "@/features/certificates/service";
import { CertificateStatusBadge } from "@/features/certificates/status-badge";
import { getOrgContext } from "@/lib/auth/session";
import { blocksApproval } from "@/lib/domain/fraud/checks";
import { stateName } from "@/lib/domain/states";
import { formatKg, formatTonnes } from "@/lib/domain/units";
import { formatInr } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Certificate" };

const SEVERITY: Record<string, { icon: LucideIcon; tone: string; label: string }> = {
  HIGH: { icon: OctagonAlertIcon, tone: "text-status-critical", label: "High" },
  MEDIUM: { icon: TriangleAlertIcon, tone: "text-status-serious", label: "Medium" },
  LOW: { icon: CircleAlertIcon, tone: "text-status-warning", label: "Low" },
};
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const order = (s: string) => (s === "HIGH" ? 0 : s === "MEDIUM" ? 1 : 2);

export default async function CertificatePage({ params }: PageProps<"/o/[orgSlug]/certificates/[certificateId]">) {
  const { orgSlug, certificateId } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(certificateId)) notFound();
  const { db, can } = await getOrgContext(orgSlug);

  const cert = await db.certificate.findUnique({
    where: { id: certificateId },
    include: {
      recycler: true,
      category: { select: { name: true } },
      file: { select: { id: true, fileName: true, sizeBytes: true, mimeType: true } },
      flags: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!cert || cert.deletedAt) notFound();

  const people = await db.membership.findMany({
    where: { userId: { in: [cert.createdById, cert.submittedById, cert.approvedById, cert.rejectedById, ...cert.flags.map((f) => f.resolvedById)].filter((x): x is string => !!x) } },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  const who = (id: string | null) => (id ? (people.find((p) => p.userId === id)?.user.name ?? "Former member") : "—");

  const base = `/o/${orgSlug}/certificates`;
  const open = cert.flags.filter((f) => f.status === "OPEN").sort((a, b) => order(a.severity) - order(b.severity));
  const closed = cert.flags.filter((f) => f.status !== "OPEN");
  const blocked = blocksApproval(cert.flags);
  const editable = cert.status === "DRAFT" || cert.status === "REJECTED";
  const showCosts = can("costs.view");

  const facts: [string, React.ReactNode][] = [
    ["Recycler", <Link key="r" href={`/o/${orgSlug}/recyclers/${cert.recyclerId}`} className="underline-offset-4 hover:underline">{cert.recycler.name}</Link>],
    ["Recycler registration", cert.recycler.cpcbRegistrationNo ?? "—"],
    ["Category", cert.category.name],
    ["Type", TYPE_LABELS[cert.type]],
    ["Financial year", `FY ${cert.financialYear}`],
    ["Quantity", `${formatTonnes(cert.quantityKg.toString())} (${formatKg(cert.quantityKg.toString())})`],
    ["Issued", dateFormat.format(cert.issueDate)],
    ["Transferred", cert.transferDate ? dateFormat.format(cert.transferDate) : "—"],
    ["State", cert.stateCode ? stateName(cert.stateCode) : "Not state-specific"],
  ];
  if (showCosts) {
    facts.push(["Amount paid", cert.costInr ? formatInr(cert.costInr.toString()) : "—"]);
    facts.push(["Price per kg", cert.pricePerKgInr ? `₹${Number(cert.pricePerKgInr).toFixed(2)}` : "—"]);
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={cert.certificateNumber}
        description={`${TYPE_LABELS[cert.type]} certificate · ${cert.category.name.split(" – ")[0]} · FY ${cert.financialYear}`}
        actions={<CertificateStatusBadge status={cert.status} />}
      />

      {cert.status === "REJECTED" && cert.rejectionReason && (
        <Alert className="border-status-critical/50">
          <CircleAlertIcon className="text-status-critical" />
          <AlertTitle>Rejected by {who(cert.rejectedById)}</AlertTitle>
          <AlertDescription>{cert.rejectionReason}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {editable && can("certificates.write") && (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/${cert.id}/edit`}>
                <PencilIcon /> Edit
              </Link>
            </Button>
            <TransitionButton orgSlug={orgSlug} id={cert.id} step="submit" />
          </>
        )}
        {cert.status === "PENDING_APPROVAL" && can("certificates.approve") && (
          <>
            <TransitionButton orgSlug={orgSlug} id={cert.id} step="approve" disabled={blocked} />
            <RejectDialog orgSlug={orgSlug} id={cert.id} />
          </>
        )}
        {can("certificates.write") && cert.status !== "APPROVED" && <TransitionButton orgSlug={orgSlug} id={cert.id} step="recheck" />}
        {cert.status === "DRAFT" && can("certificates.write") && <TransitionButton orgSlug={orgSlug} id={cert.id} step="delete" />}
      </div>
      {cert.status === "PENDING_APPROVAL" && blocked && can("certificates.approve") && (
        <p className="-mt-3 text-sm text-status-critical">Approval is blocked until the high-severity flags below are resolved or dismissed with a note.</p>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-[12rem_1fr]">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {cert.notes && <p className="mt-4 rounded-lg bg-muted p-3 text-sm">{cert.notes}</p>}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {open.length ? <FlagIcon className="size-4 text-status-serious" aria-hidden /> : <ShieldCheckIcon className="size-4 text-status-good" aria-hidden />}
                Fraud checks
              </CardTitle>
              <CardDescription>
                Duplicate numbers and files across EPRFlow, recycler status and capacity, dates and price. Other organisations are never identified.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {open.length === 0 && <p className="text-sm text-muted-foreground">No open findings.</p>}
              {open.map((f) => {
                const s = SEVERITY[f.severity];
                return (
                  <div key={f.id} className={cn("flex items-start gap-3 rounded-lg border p-3", f.severity === "HIGH" && "border-status-critical/40")}>
                    <s.icon className={cn("mt-0.5 size-4 shrink-0", s.tone)} aria-hidden />
                    <div className="grid flex-1 gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{FLAG_LABELS[f.type]}</span>
                        <Badge variant="outline">{s.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{f.message}</p>
                    </div>
                    {can("flags.dismiss") && <DismissFlagDialog orgSlug={orgSlug} flagId={f.id} message={f.message} />}
                  </div>
                );
              })}
              {closed.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">{closed.length} closed finding(s)</summary>
                  <ul className="mt-2 grid gap-2">
                    {closed.map((f) => (
                      <li key={f.id} className="rounded-lg bg-muted/50 p-2">
                        <span className="font-medium">{FLAG_LABELS[f.type]}</span> — {f.status === "DISMISSED" ? `dismissed by ${who(f.resolvedById)}` : "resolved automatically"}
                        {f.resolutionNote && <p className="text-muted-foreground">“{f.resolutionNote}”</p>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Document</CardTitle>
            </CardHeader>
            <CardContent>
              {cert.file ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <FileTextIcon className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">{cert.file.fileName}</span>
                    <span className="text-muted-foreground">({Math.round(cert.file.sizeBytes / 1024)} KB)</span>
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <a href={`/o/${orgSlug}/files/${cert.file.id}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLinkIcon /> Open
                    </a>
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No file attached. Attach the certificate PDF so auditors can verify it.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 text-sm">
                <li>Created by {who(cert.createdById)} · {timeFormat.format(cert.createdAt)}</li>
                {cert.submittedAt && <li>Submitted by {who(cert.submittedById)} · {timeFormat.format(cert.submittedAt)}</li>}
                {cert.approvedAt && <li className="text-status-good">Approved by {who(cert.approvedById)} · {timeFormat.format(cert.approvedAt)}</li>}
                {cert.rejectedAt && <li className="text-status-critical">Rejected by {who(cert.rejectedById)} · {timeFormat.format(cert.rejectedAt)}</li>}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
