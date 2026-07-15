import { createHash } from "node:crypto";

export type AccountingProvider = "fortnox" | "visma" | "generic";
export type AccountingOperation = "create_invoice" | "update_invoice" | "register_payment" | "cancel_invoice";

export type AccountingInvoiceLine = {
  description: string;
  quantity: number;
  unit: string | null;
  unitPriceExVat: number;
  vatRate: number;
  totalExVat: number;
};

export type AccountingInvoicePayload = {
  idempotencyKey: string;
  draftId: string;
  draftNumber: string;
  workOrderNumber: string | null;
  customerName: string | null;
  customerReference: string | null;
  currency: "SEK";
  invoiceDate: string;
  dueDate: string;
  notes: string | null;
  subtotalExVat: number;
  vatAmount: number;
  totalIncVat: number;
  lines: AccountingInvoiceLine[];
};

export type AccountingAdapterResult = {
  ok: boolean;
  externalReference?: string;
  response?: Record<string, unknown>;
  retryable?: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export function buildIdempotencyKey(companyId: string, draftId: string, provider: AccountingProvider, operation: AccountingOperation) {
  return createHash("sha256").update(`${companyId}:${draftId}:${provider}:${operation}`).digest("hex");
}

export function validateAccountingPayload(payload: AccountingInvoicePayload) {
  const errors: string[] = [];
  if (!payload.draftId || !payload.draftNumber) errors.push("Fakturaunderlag saknar identitet");
  if (!payload.customerName) errors.push("Kundnamn saknas");
  if (!payload.lines.length) errors.push("Fakturan saknar rader");
  if (payload.subtotalExVat < 0 || payload.vatAmount < 0 || payload.totalIncVat < 0) errors.push("Belopp får inte vara negativa");
  const calculatedSubtotal = payload.lines.reduce((sum, line) => sum + line.totalExVat, 0);
  if (Math.abs(calculatedSubtotal - payload.subtotalExVat) > 0.02) errors.push("Radsumman stämmer inte med fakturans delsumma");
  for (const [index, line] of payload.lines.entries()) {
    if (!line.description.trim()) errors.push(`Rad ${index + 1} saknar beskrivning`);
    if (!(line.quantity > 0)) errors.push(`Rad ${index + 1} har ogiltigt antal`);
    if (line.unitPriceExVat < 0 || line.totalExVat < 0) errors.push(`Rad ${index + 1} har ogiltigt belopp`);
    if (line.vatRate < 0 || line.vatRate > 100) errors.push(`Rad ${index + 1} har ogiltig momssats`);
  }
  return errors;
}

function providerEndpoint(provider: AccountingProvider) {
  if (provider === "fortnox") return process.env.FORTNOX_API_URL || "https://api.fortnox.se/3/invoices";
  if (provider === "visma") return process.env.VISMA_API_URL || "https://eaccountingapi.vismaonline.com/v2/customerinvoices";
  return process.env.ACCOUNTING_GENERIC_WEBHOOK_URL || null;
}

function providerHeaders(provider: AccountingProvider, idempotencyKey: string): Record<string, string> | null {
  if (provider === "fortnox") {
    const accessToken = process.env.FORTNOX_ACCESS_TOKEN;
    const clientSecret = process.env.FORTNOX_CLIENT_SECRET;
    if (!accessToken || !clientSecret) return null;
    return { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "Client-Secret": clientSecret, "Idempotency-Key": idempotencyKey };
  }
  if (provider === "visma") {
    const accessToken = process.env.VISMA_ACCESS_TOKEN;
    if (!accessToken) return null;
    return { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "Idempotency-Key": idempotencyKey };
  }
  const secret = process.env.ACCOUNTING_GENERIC_WEBHOOK_SECRET;
  if (!secret) return null;
  return { "Content-Type": "application/json", Authorization: `Bearer ${secret}`, "Idempotency-Key": idempotencyKey };
}

function toProviderPayload(provider: AccountingProvider, payload: AccountingInvoicePayload) {
  if (provider === "fortnox") {
    return {
      Invoice: {
        CustomerName: payload.customerName,
        YourReference: payload.customerReference,
        InvoiceDate: payload.invoiceDate,
        DueDate: payload.dueDate,
        Currency: payload.currency,
        Remarks: payload.notes,
        InvoiceRows: payload.lines.map((line) => ({ Description: line.description, DeliveredQuantity: line.quantity, Unit: line.unit || "st", Price: line.unitPriceExVat, VAT: line.vatRate })),
      },
    };
  }
  if (provider === "visma") {
    return {
      customerName: payload.customerName,
      yourReference: payload.customerReference,
      invoiceDate: payload.invoiceDate,
      dueDate: payload.dueDate,
      currencyCode: payload.currency,
      notes: payload.notes,
      rows: payload.lines.map((line) => ({ text: line.description, quantity: line.quantity, unitName: line.unit || "st", unitPrice: line.unitPriceExVat, vatRate: line.vatRate })),
    };
  }
  return payload;
}

export async function sendAccountingInvoice(provider: AccountingProvider, payload: AccountingInvoicePayload): Promise<AccountingAdapterResult> {
  const errors = validateAccountingPayload(payload);
  if (errors.length) return { ok: false, retryable: false, errorCode: "VALIDATION_ERROR", errorMessage: errors.join(". ") };
  const endpoint = providerEndpoint(provider);
  const headers = providerHeaders(provider, payload.idempotencyKey);
  if (!endpoint || !headers) return { ok: false, retryable: false, errorCode: "PROVIDER_NOT_CONFIGURED", errorMessage: `${provider} är inte konfigurerat i Vercel` };
  const started = Date.now();
  try {
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(toProviderPayload(provider, payload)), signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    let responseBody: Record<string, unknown> = {};
    try { responseBody = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { responseBody = { raw: text.slice(0, 2_000) }; }
    if (!response.ok) {
      return { ok: false, retryable: response.status === 429 || response.status >= 500, errorCode: `HTTP_${response.status}`, errorMessage: String(responseBody.message || responseBody.error || `Ekonomisystemet svarade ${response.status}`), response: { ...responseBody, durationMs: Date.now() - started } };
    }
    const externalReference = String(responseBody.DocumentNumber || responseBody.invoiceNumber || responseBody.id || responseBody.Id || "");
    return { ok: true, externalReference: externalReference || undefined, response: { ...responseBody, durationMs: Date.now() - started } };
  } catch (error) {
    return { ok: false, retryable: true, errorCode: "NETWORK_ERROR", errorMessage: error instanceof Error ? error.message : "Nätverksfel vid synkronisering" };
  }
}
