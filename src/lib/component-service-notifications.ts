export const componentServiceNotificationRoles = ["owner", "admin", "manager", "property_manager"] as const;

export type ComponentServiceNotificationRole = (typeof componentServiceNotificationRoles)[number];

export type ComponentServiceNotificationPreferences = {
  enabled: boolean;
  daysAhead: number;
  roles: ComponentServiceNotificationRole[];
  additionalEmails: string[];
};

export const defaultComponentServiceNotificationPreferences: ComponentServiceNotificationPreferences = {
  enabled: true,
  daysAhead: 30,
  roles: [...componentServiceNotificationRoles],
  additionalEmails: [],
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeComponentServiceEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isComponentServiceEmail(value: string) {
  return emailPattern.test(value);
}

export function parseComponentServiceNotificationPreferences(
  payload: unknown,
): ComponentServiceNotificationPreferences {
  const value = record(payload);
  if (!value) return { ...defaultComponentServiceNotificationPreferences, roles: [...componentServiceNotificationRoles] };

  const roles = Array.isArray(value.roles)
    ? Array.from(new Set(value.roles.filter(
        (role): role is ComponentServiceNotificationRole =>
          typeof role === "string" && componentServiceNotificationRoles.includes(role as ComponentServiceNotificationRole),
      )))
    : [...componentServiceNotificationRoles];

  const additionalEmails = Array.isArray(value.additionalEmails)
    ? Array.from(new Set(
        value.additionalEmails
          .map(normalizeComponentServiceEmail)
          .filter((email) => isComponentServiceEmail(email)),
      )).slice(0, 20)
    : [];

  const daysAhead = Number(value.daysAhead);
  return {
    enabled: value.enabled !== false,
    daysAhead: Number.isInteger(daysAhead) && daysAhead >= 1 && daysAhead <= 90
      ? daysAhead
      : defaultComponentServiceNotificationPreferences.daysAhead,
    roles: roles.length ? roles : [...componentServiceNotificationRoles],
    additionalEmails,
  };
}

export type ComponentServiceNotificationValidation =
  | { success: true; preferences: ComponentServiceNotificationPreferences }
  | { success: false; error: string };

export function validateComponentServiceNotificationPreferences(
  payload: unknown,
): ComponentServiceNotificationValidation {
  const value = record(payload);
  if (!value) return { success: false, error: "Ogiltigt JSON-underlag" };

  const daysAhead = Number(value.daysAhead);
  if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 90) {
    return { success: false, error: "Aviseringsperioden måste vara mellan 1 och 90 dagar" };
  }

  if (!Array.isArray(value.roles) || !value.roles.some(
    (role) => typeof role === "string" && componentServiceNotificationRoles.includes(role as ComponentServiceNotificationRole),
  )) {
    return { success: false, error: "Minst en giltig mottagarroll måste väljas" };
  }

  if (value.additionalEmails !== undefined && !Array.isArray(value.additionalEmails)) {
    return { success: false, error: "Extra mottagare måste anges som en lista" };
  }

  if (Array.isArray(value.additionalEmails)) {
    const submitted = value.additionalEmails.map(normalizeComponentServiceEmail).filter(Boolean);
    if (submitted.length > 20 || submitted.some((email) => !isComponentServiceEmail(email))) {
      return { success: false, error: "Ange högst 20 giltiga e-postadresser" };
    }
  }

  return {
    success: true,
    preferences: parseComponentServiceNotificationPreferences(value),
  };
}
