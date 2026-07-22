export const LEASE_STATUSES = ["draft", "reserved", "active", "notice", "ended", "cancelled"] as const;
import { normalizeSwedishOrganizationNumber } from "@/lib/swedish-organization-number";

export const LEASE_HOLDER_TYPES = ["individual", "company", "association"] as const;
export const OCCUPYING_LEASE_STATUSES = ["reserved", "active", "notice"] as const;

export type LeaseStatus = (typeof LEASE_STATUSES)[number];
export type LeaseHolderType = (typeof LEASE_HOLDER_TYPES)[number];

const leaseStatusSet = new Set<string>(LEASE_STATUSES);
const holderTypeSet = new Set<string>(LEASE_HOLDER_TYPES);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function optionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function parseOptionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!datePattern.test(text)) return undefined;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? undefined : date;
}

function parseMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 999_999_999_999.99 ? amount : undefined;
}

export type ParsedLeaseInput = {
  unitId: string;
  holderId: string | null;
  holderType: LeaseHolderType;
  holderName: string;
  holderContactName: string | null;
  holderEmail: string | null;
  holderPhone: string | null;
  holderOrganizationNumber: string | null;
  leaseNumber: string | null;
  status: LeaseStatus;
  startDate: Date | null;
  endDate: Date | null;
  noticeDate: Date | null;
  monthlyRent: number;
  deposit: number;
  annualIndexPercent: number;
  paymentTermsDays: number;
  note: string | null;
};

export function parseLeaseInput(body: Record<string, unknown>): { data: ParsedLeaseInput; error?: never } | { data?: never; error: string } {
  const unitId = String(body.unitId || "").trim();
  const holderId = optionalText(body.holderId, 80);
  const holderName = String(body.holderName || "").trim().slice(0, 160);
  const holderTypeValue = String(body.holderType || "individual").trim();
  const statusValue = String(body.status || "draft").trim();
  const leaseNumber = optionalText(body.leaseNumber, 80);
  const startDate = parseOptionalDate(body.startDate);
  const endDate = parseOptionalDate(body.endDate);
  const noticeDate = parseOptionalDate(body.noticeDate);
  const monthlyRent = parseMoney(body.monthlyRent);
  const deposit = parseMoney(body.deposit);
  const annualIndexPercent = Number(body.annualIndexPercent ?? 0);
  const paymentTermsDays = Number(body.paymentTermsDays ?? 30);
  const holderEmail = optionalText(body.holderEmail, 254)?.toLowerCase() ?? null;
  const organizationNumberInput = optionalText(body.holderOrganizationNumber, 40);
  const holderOrganizationNumber = organizationNumberInput
    ? normalizeSwedishOrganizationNumber(organizationNumberInput)
    : null;

  if (!unitId || !holderName) return { error: "Objekt och hyrespart krävs" };
  if (!holderTypeSet.has(holderTypeValue)) return { error: "Ogiltig typ av hyrespart" };
  if (!leaseStatusSet.has(statusValue)) return { error: "Ogiltig avtalsstatus" };
  if (startDate === undefined || endDate === undefined || noticeDate === undefined) return { error: "Kontrollera avtalets datum" };
  if (startDate && endDate && endDate < startDate) return { error: "Slutdatum kan inte vara före startdatum" };
  if ((statusValue === "active" || statusValue === "notice") && !startDate) return { error: "Aktiva och uppsagda avtal måste ha ett startdatum" };
  if (statusValue === "ended" && !endDate) return { error: "Avslutade avtal måste ha ett slutdatum" };
  if (monthlyRent === undefined || deposit === undefined) return { error: "Kontrollera hyra och deposition" };
  if (!Number.isFinite(annualIndexPercent) || annualIndexPercent < 0 || annualIndexPercent > 100) return { error: "Index måste vara mellan 0 och 100 procent" };
  if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 120) return { error: "Betalningsvillkor måste vara 0–120 dagar" };
  if (holderEmail && !emailPattern.test(holderEmail)) return { error: "Ange en giltig e-postadress" };
  if (organizationNumberInput && !holderOrganizationNumber) return { error: "Ange ett giltigt svenskt organisationsnummer" };
  if (holderTypeValue !== "individual" && !holderOrganizationNumber) return { error: "Organisationsnummer krävs för företag och föreningar" };

  return {
    data: {
      unitId,
      holderId,
      holderType: holderTypeValue as LeaseHolderType,
      holderName,
      holderContactName: optionalText(body.holderContactName, 160),
      holderEmail,
      holderPhone: optionalText(body.holderPhone, 60),
      holderOrganizationNumber,
      leaseNumber,
      status: statusValue as LeaseStatus,
      startDate,
      endDate,
      noticeDate,
      monthlyRent,
      deposit,
      annualIndexPercent,
      paymentTermsDays,
      note: optionalText(body.note, 2_000),
    },
  };
}

export function isOccupyingLeaseStatus(status: string) {
  return (OCCUPYING_LEASE_STATUSES as readonly string[]).includes(status);
}

export function generateLeaseNumber(now = new Date(), randomId = crypto.randomUUID()) {
  return `AVT-${now.getUTCFullYear()}-${randomId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}
