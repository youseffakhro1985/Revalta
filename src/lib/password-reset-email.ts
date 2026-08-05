import { getPublicAppUrl } from "@/lib/app-url";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] || char));
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Password reset email provider is not configured");

  const resetUrl = `${getPublicAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Återställ ditt lösenord i Revalta",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1>Återställ lösenord</h1><p>Vi har fått en begäran om att återställa lösenordet för ditt Revalta-konto.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#174f4a;color:#fff;text-decoration:none;border-radius:8px">Välj nytt lösenord</a></p><p>Länken gäller i 30 minuter och kan bara användas en gång.</p><p>Ignorera meddelandet om du inte begärde detta.</p></div>`,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new Error(`Password reset email failed with ${response.status}`);
}
