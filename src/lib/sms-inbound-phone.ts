const OPEN_TICKET_STATUSES = new Set(["new", "received", "assigned", "planned", "in_progress", "waiting"]);

export type PhoneTicket = {
  id: string;
  company_id: string;
  user_id: string;
  status: string;
};

export function swedishPhoneVariants(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed ? [trimmed] : [];

  let national = digits;
  if (national.startsWith("0046") && national.length >= 12) {
    national = `0${national.slice(4)}`;
  } else if (national.startsWith("46") && national.length >= 10) {
    national = `0${national.slice(2)}`;
  } else if (!national.startsWith("0") && national.length === 9) {
    national = `0${national}`;
  }

  const rest = national.startsWith("0") ? national.slice(1) : national;
  return [...new Set([
    trimmed,
    digits,
    national,
    rest,
    `46${rest}`,
    `+46${rest}`,
    `0046${rest}`,
  ].filter(Boolean))];
}

export function pickTenantSafeTicket(
  tickets: Array<{ id: string; company_id: string | null; user_id: string; status: string }>,
) {
  const scoped = tickets.filter((ticket): ticket is PhoneTicket => Boolean(ticket.company_id));
  const companyIds = new Set(scoped.map((ticket) => ticket.company_id));
  if (scoped.length === 0 || companyIds.size !== 1) return null;
  const open = scoped.filter((ticket) => OPEN_TICKET_STATUSES.has(ticket.status));
  return open[0] || scoped[0] || null;
}
