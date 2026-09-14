import { ticketStatusLabel } from "@/lib/domain-labels";
import { queueSmsNotification, queueTicketNotification } from "@/lib/integrations";
import { buildPortalTrackUrl, portalHomeUrl } from "@/lib/portal-track-url";

type Actor = { company_id: string | null };

export type TicketReporterContact = {
  id: string;
  title: string;
  status: string;
  public_reference?: string | null;
  reporter_email?: string | null;
  reporter_phone?: string | null;
};

function referenceSuffix(ticket: { public_reference?: string | null }) {
  const reference = ticket.public_reference?.trim();
  return reference ? ` (${reference})` : "";
}

function followupLines(trackUrl?: string | null, closed = false) {
  if (trackUrl) {
    return closed
      ? [
          "Ärendet är avslutat. Berätta gärna hur det gick via länken nedan.",
          "",
          trackUrl,
        ]
      : [
          "Följ ärendet här:",
          trackUrl,
        ];
  }
  return closed
    ? [
        `Om felet inte är åtgärdat kan du svara på det här meddelandet eller öppna ärendet i boendeportalen (${portalHomeUrl()}).`,
      ]
    : [
        `Gå till ${portalHomeUrl()} och ange referensen för mer information.`,
      ];
}

export function reporterCreatedEmailCopy(ticket: Pick<TicketReporterContact, "title" | "public_reference">, trackUrl?: string | null) {
  const suffix = referenceSuffix(ticket);
  return {
    subject: `Ärende mottaget${suffix}: ${ticket.title}`,
    text: [
      "Hej!",
      "",
      `Vi har tagit emot ärendet${suffix}: ${ticket.title}.`,
      "",
      ...followupLines(trackUrl),
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function reporterStatusEmailCopy(ticket: TicketReporterContact, trackUrl?: string | null) {
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
      ...followupLines(trackUrl, closed),
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function reporterCommentEmailCopy(ticket: TicketReporterContact, trackUrl?: string | null) {
  const suffix = referenceSuffix(ticket);
  return {
    subject: `Ny kommentar på ärendet${suffix}: ${ticket.title}`,
    text: [
      "Hej!",
      "",
      `En ny kommentar har lagts till på ärendet${suffix} (${ticket.title}).`,
      "",
      ...followupLines(trackUrl),
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function reporterStaffCreatedEmailCopy(ticket: Pick<TicketReporterContact, "title" | "public_reference">) {
  const suffix = referenceSuffix(ticket);
  return {
    subject: `Ny felanmälan${suffix}: ${ticket.title}`,
    text: [
      "Hej!",
      "",
      `Ett nytt ärende har kommit in via boendeportalen${suffix}.`,
      `Titel: ${ticket.title}`,
      "",
      "Öppna Revalta för att tilldela och åtgärda.",
      "",
      "Vänliga hälsningar,",
      "Revalta",
    ].join("\n"),
  };
}

export function reporterStatusSmsCopy(ticket: TicketReporterContact, smsSafeUrl?: string | null) {
  const statusText = ticketStatusLabel(ticket.status);
  const follow = smsSafeUrl ? ` Följ på ${smsSafeUrl}.` : ` Följ på ${portalHomeUrl()} med referensen.`;
  return `Revalta: ärendet${referenceSuffix(ticket)} är nu ${statusText}.${follow}`;
}

export function reporterCreatedSmsCopy(reference: string) {
  return `Tack! Ärende ${reference} är mottaget. Följ på ${portalHomeUrl()} med referensen.`;
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
  const closed = ticket.status === "closed" || ticket.status === "completed";
  const track = buildPortalTrackUrl({
    reference: ticket.public_reference,
    email,
    companyId: actor.company_id,
    feedback: event === "updated" && closed,
  });
  const trackUrl = track.hasToken || track.reference ? track.url : null;

  if (emailed) {
    const copy = event === "updated"
      ? reporterStatusEmailCopy(ticket, trackUrl)
      : reporterCommentEmailCopy(ticket, trackUrl);
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
      message: reporterStatusSmsCopy(ticket, track.smsSafeUrl),
    });
  }

  return { emailed, sms };
}
