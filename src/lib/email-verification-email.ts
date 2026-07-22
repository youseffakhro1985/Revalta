function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.revalta.se").replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] || char));
}

export async function sendEmailVerificationEmail(email: string, token: string) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Email verification provider is not configured");

  const verifyUrl = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Verifiera din e-postadress i Revalta",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1>Verifiera din e-postadress</h1><p>Bekräfta att ${escapeHtml(email)} tillhör dig för att säkra ditt Revalta-konto.</p><p><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;padding:12px 18px;background:#174f4a;color:#fff;text-decoration:none;border-radius:8px">Verifiera e-postadress</a></p><p>Länken gäller i 24 timmar och kan bara användas en gång.</p><p>Ignorera meddelandet om du inte begärde detta.</p></div>`,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new Error(`Email verification failed with ${response.status}`);
}
