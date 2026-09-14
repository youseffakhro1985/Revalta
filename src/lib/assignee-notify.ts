import { getPublicAppUrl } from "@/lib/app-url";
import { queueTicketNotification } from "@/lib/integrations";

type Actor = { id: string; company_id: string | null };

export type AssigneeNotifyKind = "assigned" | "paused" | "completed" | "cancelled" | "resumed";

export type AssigneeNotifyTarget = {
  id: string;
  title: string;
  kind: "ticket" | "work_order";
  assigneeId?: string | null;
  assigneeEmail?: string | null;
  notifyKind?: AssigneeNotifyKind;
  pauseLabel?: string | null;
  resumeLabel?: string | null;
};

function staffPath(target: AssigneeNotifyTarget) {
  return target.kind === "work_order"
    ? `/dashboard/arbetsorder/${target.id}`
    : `/dashboard/felanmalan/${target.id}`;
}

function staffUrl(target: AssigneeNotifyTarget) {
  return `${getPublicAppUrl()}${staffPath(target)}`;
}

export function assigneeAssignedEmailCopy(target: AssigneeNotifyTarget) {
  const kindLabel = target.kind === "work_order" ? "arbetsordern" : "ärendet";
  return {
    subject: `Tilldelad: ${target.title}`,
    text: [
      "Hej!",
      "",
      `Du har tilldelats ${kindLabel} "${target.title}".`,
      "",
      `Öppna i Revalta: ${staffUrl(target)}`,
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function assigneePausedEmailCopy(target: AssigneeNotifyTarget) {
  const kindLabel = target.kind === "work_order" ? "Arbetsordern" : "Ärendet";
  const pauseLabel = target.pauseLabel?.trim() || "Pausad";
  return {
    subject: `Pausad: ${target.title}`,
    text: [
      "Hej!",
      "",
      `${kindLabel} "${target.title}" är pausad i Revalta: ${pauseLabel}.`,
      "",
      `Öppna i Revalta: ${staffUrl(target)}`,
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function assigneeCompletedEmailCopy(target: AssigneeNotifyTarget) {
  const kindLabel = target.kind === "work_order" ? "Arbetsordern" : "Ärendet";
  return {
    subject: `Slutförd: ${target.title}`,
    text: [
      "Hej!",
      "",
      `${kindLabel} "${target.title}" är markerad som slutförd i Revalta.`,
      "",
      `Öppna i Revalta: ${staffUrl(target)}`,
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function assigneeCancelledEmailCopy(target: AssigneeNotifyTarget) {
  const kindLabel = target.kind === "work_order" ? "Arbetsordern" : "Ärendet";
  return {
    subject: `Avbruten: ${target.title}`,
    text: [
      "Hej!",
      "",
      `${kindLabel} "${target.title}" är avbruten i Revalta.`,
      "",
      `Öppna i Revalta: ${staffUrl(target)}`,
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function assigneeResumedEmailCopy(target: AssigneeNotifyTarget) {
  const kindLabel = target.kind === "work_order" ? "Arbetsordern" : "Ärendet";
  const resumeLabel = target.resumeLabel?.trim() || "Återupptagen";
  return {
    subject: `Återupptagen: ${target.title}`,
    text: [
      "Hej!",
      "",
      `${kindLabel} "${target.title}" kan återupptas i Revalta: ${resumeLabel}.`,
      "",
      `Öppna i Revalta: ${staffUrl(target)}`,
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function assigneeNotifyEmailCopy(target: AssigneeNotifyTarget) {
  if (target.notifyKind === "completed") return assigneeCompletedEmailCopy(target);
  if (target.notifyKind === "paused") return assigneePausedEmailCopy(target);
  if (target.notifyKind === "cancelled") return assigneeCancelledEmailCopy(target);
  if (target.notifyKind === "resumed") return assigneeResumedEmailCopy(target);
  return assigneeAssignedEmailCopy(target);
}

export async function notifyAssignee(actor: Actor, target: AssigneeNotifyTarget) {
  const assigneeId = target.assigneeId?.trim() || "";
  const email = target.assigneeEmail?.trim() || "";
  if (!assigneeId || !email.includes("@")) return { emailed: false };
  if (assigneeId === actor.id) return { emailed: false };

  await queueTicketNotification(actor, {
    ticketId: target.id,
    title: target.title,
    recipient: email,
    event: "updated",
    emailContent: assigneeNotifyEmailCopy(target),
  });

  return { emailed: true };
}
