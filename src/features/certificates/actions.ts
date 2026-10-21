"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { fieldErrors, handleActionError, type ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requirePermission, type OrgContext } from "@/lib/auth/session";
import { blocksApproval, normalizeCertificateNumber } from "@/lib/domain/fraud/checks";
import { storeDocument } from "@/lib/files/documents";
import { DocumentError } from "@/lib/files/sniff";
import { refreshCertificateFlags } from "@/lib/fraud/service";
import { StorageNotConfiguredError } from "@/lib/storage";
import { certificateSchema, dismissSchema, rejectSchema } from "@/lib/validation/certificate";
import { syncApprovalAlert } from "./service";

const ID = /^[a-z0-9]{10,40}$/i;
const EDITABLE = new Set(["DRAFT", "REJECTED"]);

function refresh(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}`, "layout");
}

/** Recycler ids come from the browser: it must be a platform recycler or this organisation's own. */
async function checkReferences(ctx: OrgContext, recyclerId: string, categoryId: string) {
  const [recycler, category] = await Promise.all([
    ctx.db.recycler.findFirst({ where: { id: recyclerId }, select: { id: true } }),
    ctx.db.materialCategory.findFirst({ where: { id: categoryId, stream: { in: ctx.org.wasteStreams } }, select: { id: true } }),
  ]);
  const errors: Record<string, string[]> = {};
  if (!recycler) errors.recyclerId = ["Select a recycler from the directory"];
  if (!category) errors.categoryId = ["Select a category for your waste streams"];
  return Object.keys(errors).length ? errors : null;
}

/** Create (`id` null) or edit a draft/rejected certificate. `intent=submit` also sends it for approval. */
export async function saveCertificateAction(orgSlug: string, id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let savedId: string;
  try {
    if (id !== null && !ID.test(id)) return { error: "Invalid request." };
    const ctx = await requirePermission(orgSlug, "certificates.write");
    const { db, org, user } = ctx;
    const submit = formData.get("intent") === "submit";

    const parsed = certificateSchema().safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
    if (!parsed.success) return fieldErrors(parsed.error);
    const data = parsed.data;
    const refErrors = await checkReferences(ctx, data.recyclerId, data.categoryId);
    if (refErrors) return { error: "Please fix the highlighted fields.", fieldErrors: refErrors };

    const existing = id ? await db.certificate.findUnique({ where: { id } }) : null;
    if (id && (!existing || existing.deletedAt)) return { error: "This certificate no longer exists." };
    if (existing && !EDITABLE.has(existing.status)) return { error: "Only draft or rejected certificates can be edited." };

    const normalized = normalizeCertificateNumber(data.certificateNumber);
    const clash = await db.certificate.findFirst({
      where: { certificateNumberNormalized: normalized, ...(existing ? { id: { not: existing.id } } : {}) },
      select: { id: true, status: true },
    });
    if (clash) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { certificateNumber: [`This certificate number is already recorded in your organisation (${clash.status.toLowerCase().replace("_", " ")}).`] },
      };
    }

    const upload = formData.get("file");
    const file =
      upload instanceof File && upload.size > 0
        ? await storeDocument(db, { organizationId: org.id, userId: user.id, file: upload, kind: "CERTIFICATE_PDF", allowed: ["application/pdf", "image/png", "image/jpeg"] })
        : null;

    const values = {
      certificateNumber: data.certificateNumber,
      certificateNumberNormalized: normalized,
      recyclerId: data.recyclerId,
      categoryId: data.categoryId,
      type: data.type,
      financialYear: data.financialYear,
      stateCode: data.stateCode ?? null,
      quantityKg: data.quantityKg.toFixed(3),
      issueDate: data.issueDate,
      transferDate: data.transferDate ?? null,
      costInr: data.cost === null ? null : data.cost.toFixed(2),
      pricePerKgInr: data.pricePerKgInr === null ? null : data.pricePerKgInr.toFixed(4),
      notes: data.notes ?? null,
      ...(file ? { fileId: file.id } : {}),
    };
    const workflow = submit
      ? { status: "PENDING_APPROVAL" as const, submittedAt: new Date(), submittedById: user.id }
      : { status: "DRAFT" as const };

    const saved = await db.$transaction(async (tx) => {
      const cert = existing
        ? await tx.certificate.update({ where: { id: existing.id }, data: { ...values, ...workflow, rejectedAt: null, rejectedById: null, rejectionReason: null } })
        : await tx.certificate.create({ data: { ...values, ...workflow, organizationId: org.id, createdById: user.id } });
      await audit(tx, {
        organizationId: org.id,
        actorId: user.id,
        action: existing ? "certificate.update" : "certificate.create",
        entityType: "Certificate",
        entityId: cert.id,
        before: existing ? { ...existing, quantityKg: existing.quantityKg.toString(), costInr: existing.costInr?.toString() } : undefined,
        after: { ...values, status: workflow.status },
      });
      if (submit) {
        await audit(tx, { organizationId: org.id, actorId: user.id, action: "certificate.submit", entityType: "Certificate", entityId: cert.id });
      }
      return cert;
    });
    savedId = saved.id;
    await refreshCertificateFlags(db, saved.id);
    await syncApprovalAlert(db, org.id, orgSlug);
    refresh(orgSlug);
  } catch (error) {
    if (error instanceof DocumentError) return { error: error.message, fieldErrors: { file: [error.message] } };
    if (error instanceof StorageNotConfiguredError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Please fix the highlighted fields.", fieldErrors: { certificateNumber: ["This certificate number is already recorded in your organisation."] } };
    }
    return handleActionError(error);
  }
  redirect(`/o/${orgSlug}/certificates/${savedId}`);
}

type Transition = "submit" | "approve" | "recheck" | "delete";

/** Workflow steps that need no form input. */
export async function certificateTransitionAction(orgSlug: string, id: string, step: Transition): Promise<ActionState> {
  try {
    if (!ID.test(id) || !["submit", "approve", "recheck", "delete"].includes(step)) return { error: "Invalid request." };
    const permission = step === "approve" ? "certificates.approve" : "certificates.write";
    const { db, org, user } = await requirePermission(orgSlug, permission);
    const cert = await db.certificate.findUnique({ where: { id }, include: { flags: true } });
    if (!cert || cert.deletedAt) return { error: "This certificate no longer exists." };

    if (step === "recheck") {
      const flags = await refreshCertificateFlags(db, id);
      refresh(orgSlug);
      return { ok: true, message: flags.length ? `Checks complete — ${flags.length} finding(s).` : "Checks complete — no issues found." };
    }

    if (step === "submit") {
      if (!EDITABLE.has(cert.status)) return { error: "This certificate has already been submitted." };
      await db.$transaction(async (tx) => {
        await tx.certificate.update({ where: { id }, data: { status: "PENDING_APPROVAL", submittedAt: new Date(), submittedById: user.id } });
        await audit(tx, { organizationId: org.id, actorId: user.id, action: "certificate.submit", entityType: "Certificate", entityId: id, before: { status: cert.status }, after: { status: "PENDING_APPROVAL" } });
      });
      await refreshCertificateFlags(db, id);
      await syncApprovalAlert(db, org.id, orgSlug);
      refresh(orgSlug);
      return { ok: true, message: "Submitted for approval." };
    }

    if (step === "approve") {
      if (cert.status !== "PENDING_APPROVAL") return { error: "Only certificates awaiting approval can be approved." };
      await refreshCertificateFlags(db, id); // never approve on stale checks
      const flags = await db.certificateFlag.findMany({ where: { certificateId: id } });
      if (blocksApproval(flags)) {
        refresh(orgSlug);
        return { error: "Resolve or dismiss the high-severity flags (with a note) before approving." };
      }
      await db.$transaction(async (tx) => {
        await tx.certificate.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id } });
        await audit(tx, { organizationId: org.id, actorId: user.id, action: "certificate.approve", entityType: "Certificate", entityId: id, before: { status: cert.status }, after: { status: "APPROVED" } });
      });
      await syncApprovalAlert(db, org.id, orgSlug);
      refresh(orgSlug);
      return { ok: true, message: "Certificate approved — it now counts towards your targets." };
    }

    // delete: drafts only (approved and submitted certificates are part of the record)
    if (cert.status !== "DRAFT") return { error: "Only drafts can be deleted. Submitted certificates stay on record." };
    await db.$transaction(async (tx) => {
      await tx.certificate.delete({ where: { id } });
      await audit(tx, { organizationId: org.id, actorId: user.id, action: "certificate.delete", entityType: "Certificate", entityId: id, before: { certificateNumber: cert.certificateNumber } });
    });
    refresh(orgSlug);
  } catch (error) {
    return handleActionError(error);
  }
  redirect(`/o/${orgSlug}/certificates`);
}

export async function rejectCertificateAction(orgSlug: string, id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    if (!ID.test(id)) return { error: "Invalid request." };
    const { db, org, user } = await requirePermission(orgSlug, "certificates.approve");
    const parsed = rejectSchema.safeParse({ reason: formData.get("reason") ?? undefined });
    if (!parsed.success) return fieldErrors(parsed.error);
    const cert = await db.certificate.findUnique({ where: { id } });
    if (!cert || cert.deletedAt) return { error: "This certificate no longer exists." };
    if (cert.status !== "PENDING_APPROVAL") return { error: "Only certificates awaiting approval can be rejected." };

    await db.$transaction(async (tx) => {
      await tx.certificate.update({
        where: { id },
        data: { status: "REJECTED", rejectedAt: new Date(), rejectedById: user.id, rejectionReason: parsed.data.reason },
      });
      await audit(tx, { organizationId: org.id, actorId: user.id, action: "certificate.reject", entityType: "Certificate", entityId: id, before: { status: cert.status }, after: { status: "REJECTED", reason: parsed.data.reason } });
    });
    await syncApprovalAlert(db, org.id, orgSlug);
    refresh(orgSlug);
    return { ok: true, message: "Certificate rejected. The submitter can correct and resubmit it." };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function dismissFlagAction(orgSlug: string, flagId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    if (!ID.test(flagId)) return { error: "Invalid request." };
    const { db, org, user } = await requirePermission(orgSlug, "flags.dismiss");
    const parsed = dismissSchema.safeParse({ note: formData.get("note") ?? undefined });
    if (!parsed.success) return fieldErrors(parsed.error);
    const flag = await db.certificateFlag.findUnique({ where: { id: flagId } });
    if (!flag) return { error: "This flag no longer exists." };
    if (flag.status !== "OPEN") return { error: "This flag is already closed." };

    await db.$transaction(async (tx) => {
      await tx.certificateFlag.update({
        where: { id: flagId },
        data: { status: "DISMISSED", resolvedAt: new Date(), resolvedById: user.id, resolutionNote: parsed.data.note },
      });
      await audit(tx, { organizationId: org.id, actorId: user.id, action: "flag.dismiss", entityType: "CertificateFlag", entityId: flagId, before: { type: flag.type, status: "OPEN" }, after: { status: "DISMISSED", note: parsed.data.note } });
    });
    refresh(orgSlug);
    return { ok: true, message: "Flag dismissed with your note." };
  } catch (error) {
    return handleActionError(error);
  }
}
