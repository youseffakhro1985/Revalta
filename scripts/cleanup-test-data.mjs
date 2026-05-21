import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const testCompanyTerms = [
  "Test",
  "Debug",
  "Portal",
  "Audit",
  "Attachment",
  "Premium Förvaltning",
  "AI Billing",
  "Live Production",
  "Env Test",
];

async function main() {
  const testUsers = await db.user.findMany({
    where: {
      OR: [
        { email: { endsWith: "@example.se", mode: "insensitive" } },
        { email: { endsWith: "@example.com", mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  const testUserIds = testUsers.map((user) => user.id);

  const testCompanies = await db.company.findMany({
    where: {
      OR: testCompanyTerms.map((term) => ({
        name: { contains: term, mode: "insensitive" },
      })),
    },
    select: { id: true },
  });
  const testCompanyIds = testCompanies.map((company) => company.id);

  const testTickets = await db.ticket.findMany({
    where: {
      OR: [
        { user_id: { in: testUserIds } },
        { company_id: { in: testCompanyIds } },
        { reporter_email: { endsWith: "@example.se", mode: "insensitive" } },
        { reporter_email: { endsWith: "@example.com", mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  const testTicketIds = testTickets.map((ticket) => ticket.id);

  const result = {
    attachments: await db.ticketAttachment.deleteMany({ where: { ticket_id: { in: testTicketIds } } }),
    comments: await db.ticketComment.deleteMany({
      where: { OR: [{ ticket_id: { in: testTicketIds } }, { user_id: { in: testUserIds } }] },
    }),
    emailVerificationTokens: await db.emailVerificationToken.deleteMany({ where: { user_id: { in: testUserIds } } }),
    passwordTokens: await db.passwordResetToken.deleteMany({ where: { user_id: { in: testUserIds } } }),
    auditLogs: await db.auditLog.deleteMany({
      where: {
        OR: [
          { actor_user_id: { in: testUserIds } },
          { company_id: { in: testCompanyIds } },
          { entity_id: { in: [...testTicketIds, ...testUserIds, ...testCompanyIds] } },
        ],
      },
    }),
    integrationEvents: await db.integrationEvent.deleteMany({ where: { company_id: { in: testCompanyIds } } }),
    tickets: await db.ticket.deleteMany({ where: { id: { in: testTicketIds } } }),
    properties: await db.property.deleteMany({
      where: { OR: [{ user_id: { in: testUserIds } }, { company_id: { in: testCompanyIds } }] },
    }),
    users: await db.user.deleteMany({ where: { id: { in: testUserIds } } }),
    companies: await db.company.deleteMany({ where: { id: { in: testCompanyIds } } }),
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
