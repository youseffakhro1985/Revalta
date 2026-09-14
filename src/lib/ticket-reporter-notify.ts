import { ticketStatusLabel } from "@/lib/domain-labels";
import { queueSmsNotification, queueTicketNotification } from "@/lib/integrations";

type Actor = { company_id: string | null };

export type TicketReporterContact = {
  id: string;
  title: string;
  status: string;
  public_reference?: string | null;
  reporter_email?: string | null;
  reporter_phone?: string | null;
};

function referenceSuffix(ticket: TicketReporterContact) {
  const reference = ticket.public_reference?.trim();
  return reference ? ` (${reference})` : "";
}

export function reporterStatusEmailCopy(ticket: TicketReporterContact) {
  const statusText = ticketStatusLabel(ticket.status);
  const suffix = referenceSuffix(ticket);
  const closed = ticket.status === "closed" || ticket.status === "completed";
  return {
    subject: `Ärende ${statusText}: ${ticket.title}`,
    text: [
      "Hej!",
      "",
      `Status på ärendet${suffix} är nu: ${statusText}.`,
      "",
      closed
        ? "Om felet inte är åtgärdat kan du svara på det här meddelandet eller öppna ärendet i boendeportalen."
        : "Logga in i boendeportalen eller följ ärendet med referensen för mer information.",
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function reporterCommentEmailCopy(ticket: TicketReporterContact) {
  const suffix = referenceSuffix(ticket);
  return {
    subject: `Ny kommentar på ärendet${suffix}: ${ticket.title}`,
    text: [
      "Hej!",
      "",
      `En ny kommentar har lagts till på ärendet${suffix} (${ticket.title}).`,
      "",
      "Logga in i boendeportalen eller följ ärendet med referensen för mer information.",
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function reporterStatusSmsCopy(ticket: TicketReporterContact) {
  const statusText = ticketStatusLabel(ticket.status);
  return `Revalta: ärendet${referenceSuffix(ticket)} är nu ${statusText}.`;
}

export async function notifyTicketReporter(
  actor: Actor,
  ticket: TicketReporterContact,
  event: "updated" | "commented",
) {
  const email = ticket.reporter_email?.trim() || "";
  const phone = ticket.reporter_phone?.trim() || "";
  const emailed = Boolean(email);
  const sms = Boolean(phone && event === "updated");

  if (emailed) {
    const copy = event === "updated" ? reporterStatusEmailCopy(ticket) : reporterCommentEmailCopy(ticket);
    await queueTicketNotification(actor, {
      ticketId: ticket.id,
      title: ticket.title,
      recipient: email,
      event,
      emailContent: copy,
    });
  }

  if (sms) {
    await queueSmsNotification(actor, {
      ticketId: ticket.id,
      recipient: phone,
      message: reporterStatusSmsCopy(ticket),
    });
  }

  return { emailed, sms };
}
