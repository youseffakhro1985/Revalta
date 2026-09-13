const greetingFormatter = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function overviewGreeting(now: Date) {
  const hour = now.getHours();
  if (hour < 5) return "God natt";
  if (hour < 10) return "God morgon";
  if (hour < 18) return "God eftermiddag";
  return "God kväll";
}

export function overviewFirstName(name: string | null | undefined, email: string) {
  const trimmed = (name || "").trim();
  if (trimmed) return trimmed.split(/\s+/)[0] || trimmed;
  const local = email.split("@")[0] || "där";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function overviewRoleLabel(role: string) {
  if (role === "owner") return "Ägare";
  if (role === "admin") return "Administratör";
  if (role === "manager") return "Förvaltare";
  if (role === "technician") return "Tekniker";
  if (role === "viewer") return "Läsbehörighet";
  return role;
}

export function overviewLongDate(now: Date) {
  const formatted = greetingFormatter.format(now);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
