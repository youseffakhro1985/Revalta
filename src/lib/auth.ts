import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import db from "@/lib/db";
import { signToken, verifyToken, type SessionPayload } from "@/lib/session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get("token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export { signToken };

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  return db.user.findFirst({
    where: {
      id: session.sub,
      deletedAt: null,
      status: { notIn: ["blocked", "deleted"] },
    },
    include: {
      memberships: {
        where: {
          status: { notIn: ["blocked", "deleted"] },
          company: {
            status: "active",
            deletedAt: null,
          },
        },
        include: { company: true },
        take: 1,
      },
    },
  });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user || user.memberships.length === 0) {
    redirect("/logga-in");
  }

  return {
    ...user,
    activeMembership: user.memberships[0],
    activeCompany: user.memberships[0].company,
  };
}
