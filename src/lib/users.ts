import { User } from "@/types";

// I produktion: ersätt med riktig databas (t.ex. Prisma + PostgreSQL)
export const MOCK_USERS = [
  {
    id: "1",
    name: "Admin User",
    email: "admin@revalta.se",
    // Lösenord: "admin123"
    passwordHash: "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi",
    role: "admin" as const,
  },
  {
    id: "2",
    name: "Anna Svensson",
    email: "anna@fastighet.se",
    // Lösenord: "kund123"
    passwordHash: "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi",
    role: "customer" as const,
  },
];

export function getUserByEmail(email: string) {
  return MOCK_USERS.find((u) => u.email === email) || null;
}
