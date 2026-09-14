import { getPublicAppUrl } from "@/lib/app-url";
import { queueTicketNotification } from "@/lib/integrations";

type Actor = { id: string; company_id: string | null };

export type AssigneeNotifyTarget = {
  id: string;
  title: string;
  kind: "ticket" | "work_order";
  assigneeId?: string | null;
  assigneeEmail?: string | null;
};

export function assigneeAssignedEmailCopy(target: AssigneeNotifyTarget) {
  const kindLabel = target.kind === "work_order" ? "arbetsordern" : "ärendet";
  const path = target.kind === "work_order"
    ? `/dashboard/arbetsorder/${target.id}`
    : `/dashboard/felanmalan/${target.id}`;
  const url = `${getPublicAppUrl()}${path}`;
  return {
    subject: `Tilldelad: ${target.title}`,
    text: [
      "Hej!",
      "",
      `Du har tilldelats ${kindLabel} "${target.title}".`,
      "",
      `Öppna i Revalta: ${url}`,
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
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
    emailContent: assigneeAssignedEmailCopy(target),
  });

  return { emailed: true };
}
