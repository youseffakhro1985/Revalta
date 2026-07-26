import type { Prisma } from "@prisma/client";
import db from "@/lib/db";

export const serviceNotificationAllowedRoles = ["owner", "admin", "manager", "property_manager"] as const;
export type ServiceNotificationRole = (typeof serviceNotificationAllowedRoles)[number];

export type CompanyServicePreferences = {
  enabled: boolean;
  daysAhead: number;
  roles: ServiceNotificationRole[];
  additionalEmails: string[];
};

export type UserServicePreferences = {
  enabled: boolean;
  overdueOnly: boolean;
};

export const defaultCompanyServicePreferences: CompanyServicePreferences = {
  enabled: true,
  daysAhead: 30,
  roles: [...serviceNotificationAllowedRoles],
  additionalEmails: [],
};

export const defaultUserServicePreferences: UserServicePreferences = {
  enabled: true,
  overdueOnly: false,
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function parseCompanyServicePreferences(payload: unknown): CompanyServicePreferences {
  const value = record(payload);
  if (!value) return defaultCompanyServicePreferences;
  const roles = Array.isArray(value.roles)
    ? Array.from(new Set(
      value.roles.filter((role): role is ServiceNotificationRole =>
        typeof role === "string" && serviceNotificationAllowedRoles.includes(role as ServiceNotificationRole)),
    ))
    : defaultCompanyServicePreferences.roles;
  const additionalEmails = Array.isArray(value.additionalEmails)
    ? Array.from(new Set(value.additionalEmails.map(normalizeEmail).filter((email) => emailPattern.test(email)))).slice(0, 20)
    : [];
  const days = Number(value.daysAhead);
  return {
    enabled: value.enabled !== false,
    daysAhead: Number.isInteger(days) && days >= 1 && days <= 90 ? days : defaultCompanyServicePreferences.daysAhead,
    roles: roles.length ? roles : defaultCompanyServicePreferences.roles,
    additionalEmails,
  };
}

export function parseUserServicePreferences(payload: unknown): UserServicePreferences {
  const value = record(payload);
  if (!value) return defaultUserServicePreferences;
  return {
    enabled: value.enabled !== false,
    overdueOnly: value.overdueOnly === true,
  };
}

export async function getCompanyServicePreferences(companyId: string) {
  const modern = await db.serviceNotificationSettings.findUnique({
    where: { company_id: companyId },
    select: {
      enabled: true,
      days_ahead: true,
      roles: true,
      additional_emails: true,
      updated_at: true,
    },
  });
  if (modern) {
    return {
      preferences: {
        enabled: modern.enabled,
        daysAhead: modern.days_ahead,
        roles: Array.isArray(modern.roles)
          ? modern.roles.filter((role): role is ServiceNotificationRole =>
            typeof role === "string" && serviceNotificationAllowedRoles.includes(role as ServiceNotificationRole))
          : defaultCompanyServicePreferences.roles,
        additionalEmails: Array.isArray(modern.additional_emails)
          ? modern.additional_emails.filter((email): email is string => typeof email === "string")
          : [],
      } satisfies CompanyServicePreferences,
      updatedAt: modern.updated_at,
      source: "table" as const,
    };
  }

  return {
    preferences: { ...defaultCompanyServicePreferences, roles: [...defaultCompanyServicePreferences.roles], additionalEmails: [] },
    updatedAt: null,
    source: "defaults" as const,
  };
}

type DbClient = Pick<typeof db, "serviceNotificationSettings" | "userServiceNotificationPreference">;

export async function upsertCompanyServicePreferences(
  companyId: string,
  userId: string,
  preferences: CompanyServicePreferences,
  client: DbClient = db,
) {
  const roles = preferences.roles as unknown as Prisma.InputJsonValue;
  const additionalEmails = preferences.additionalEmails as unknown as Prisma.InputJsonValue;
  return client.serviceNotificationSettings.upsert({
    where: { company_id: companyId },
    create: {
      company_id: companyId,
      enabled: preferences.enabled,
      days_ahead: preferences.daysAhead,
      roles,
      additional_emails: additionalEmails,
      updated_by_id: userId,
    },
    update: {
      enabled: preferences.enabled,
      days_ahead: preferences.daysAhead,
      roles,
      additional_emails: additionalEmails,
      updated_by_id: userId,
    },
    select: { updated_at: true },
  });
}

export async function getUserServicePreferences(companyId: string, userId: string) {
  const modern = await db.userServiceNotificationPreference.findUnique({
    where: { company_id_user_id: { company_id: companyId, user_id: userId } },
    select: { enabled: true, overdue_only: true, updated_at: true },
  });
  if (modern) {
    return {
      preferences: {
        enabled: modern.enabled,
        overdueOnly: modern.overdue_only,
      } satisfies UserServicePreferences,
      updatedAt: modern.updated_at,
      source: "table" as const,
    };
  }

  return {
    preferences: { ...defaultUserServicePreferences },
    updatedAt: null,
    source: "defaults" as const,
  };
}

export async function upsertUserServicePreferences(
  companyId: string,
  userId: string,
  preferences: UserServicePreferences,
  client: DbClient = db,
) {
  return client.userServiceNotificationPreference.upsert({
    where: { company_id_user_id: { company_id: companyId, user_id: userId } },
    create: {
      company_id: companyId,
      user_id: userId,
      enabled: preferences.enabled,
      overdue_only: preferences.overdueOnly,
    },
    update: {
      enabled: preferences.enabled,
      overdue_only: preferences.overdueOnly,
    },
    select: { updated_at: true },
  });
}
