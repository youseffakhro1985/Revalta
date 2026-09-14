import { queueTicketNotification } from "@/lib/integrations";

type Actor = { id: string; company_id: string | null };

export type VendorNotifyKind = "assigned" | "completed" | "paused";

export type VendorNotifyTarget = {
  workOrderId: string;
  title: string;
  workOrderNumber?: string | null;
  propertyName?: string | null;
  vendorContractId: string;
  vendorEmail?: string | null;
  kind?: VendorNotifyKind;
  pauseLabel?: string | null;
};

function headingLines(target: VendorNotifyTarget) {
  const number = target.workOrderNumber?.trim() || "";
  const propertyName = target.propertyName?.trim() || "";
  return {
    number,
    propertyName,
    details: [
      ...(number ? [`Arbetsorder: ${number}`] : []),
      ...(propertyName ? [`Fastighet: ${propertyName}`] : []),
      `Uppdrag: ${target.title}`,
    ],
  };
}

export function vendorAssignedEmailCopy(target: VendorNotifyTarget) {
  const { number, details } = headingLines(target);
  const heading = number ? `Ny arbetsorder ${number}` : "Ny arbetsorder";
  return {
    subject: `${heading}: ${target.title}`,
    text: [
      "Hej!",
      "",
      "Ni har fått en ny arbetsorder från Revalta.",
      "",
      ...details,
      "",
      "Kontakta beställaren för tid och åtkomst. Mejlet innehåller ingen inloggning.",
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function vendorCompletedEmailCopy(target: VendorNotifyTarget) {
  const { number, details } = headingLines(target);
  const heading = number ? `Arbetsorder klar ${number}` : "Arbetsorder klar";
  return {
    subject: `${heading}: ${target.title}`,
    text: [
      "Hej!",
      "",
      "Arbetsordern är markerad som slutförd i Revalta.",
      "",
      ...details,
      "",
      "Kontakta beställaren om något återstår. Mejlet innehåller ingen inloggning.",
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function vendorPausedEmailCopy(target: VendorNotifyTarget) {
  const { number, details } = headingLines(target);
  const pauseLabel = target.pauseLabel?.trim() || "Pausad";
  const heading = number ? `Arbetsorder pausad ${number}` : "Arbetsorder pausad";
  return {
    subject: `${heading}: ${target.title}`,
    text: [
      "Hej!",
      "",
      `Arbetsordern är pausad i Revalta: ${pauseLabel}.`,
      "",
      ...details,
      "",
      "Kontakta beställaren om ni behöver mer information. Mejlet innehåller ingen inloggning.",
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function vendorNotifyEmailCopy(target: VendorNotifyTarget) {
  if (target.kind === "completed") return vendorCompletedEmailCopy(target);
  if (target.kind === "paused") return vendorPausedEmailCopy(target);
  return vendorAssignedEmailCopy(target);
}

export async function notifyVendor(actor: Actor, target: VendorNotifyTarget) {
  const vendorContractId = target.vendorContractId.trim();
  const email = target.vendorEmail?.trim() || "";
  if (!vendorContractId || !email.includes("@")) return { emailed: false };

  await queueTicketNotification(actor, {
    ticketId: target.workOrderId,
    title: target.title,
    recipient: email,
    event: "updated",
    emailContent: vendorNotifyEmailCopy(target),
  });

  return { emailed: true };
}
