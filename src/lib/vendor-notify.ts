import { queueTicketNotification } from "@/lib/integrations";

type Actor = { id: string; company_id: string | null };

export type VendorNotifyTarget = {
  workOrderId: string;
  title: string;
  workOrderNumber?: string | null;
  propertyName?: string | null;
  vendorContractId: string;
  vendorEmail?: string | null;
};

export function vendorAssignedEmailCopy(target: VendorNotifyTarget) {
  const number = target.workOrderNumber?.trim() || "";
  const propertyName = target.propertyName?.trim() || "";
  const heading = number ? `Ny arbetsorder ${number}` : "Ny arbetsorder";
  return {
    subject: `${heading}: ${target.title}`,
    text: [
      "Hej!",
      "",
      "Ni har fått en ny arbetsorder från Revalta.",
      "",
      ...(number ? [`Arbetsorder: ${number}`] : []),
      ...(propertyName ? [`Fastighet: ${propertyName}`] : []),
      `Uppdrag: ${target.title}`,
      "",
      "Kontakta beställaren för tid och åtkomst. Mejlet innehåller ingen inloggning.",
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
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
    emailContent: vendorAssignedEmailCopy(target),
  });

  return { emailed: true };
}
