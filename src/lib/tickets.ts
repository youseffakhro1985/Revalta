import { Ticket } from "@/types";

// In-memory store – ersätt med databas i produktion
let tickets: Ticket[] = [
  {
    id: "1",
    title: "Trasig hiss",
    description: "Hissen på plan 3 fungerar inte sedan igår.",
    status: "open",
    createdAt: "2026-04-18T10:00:00Z",
    createdBy: "Anna Svensson",
    propertyAddress: "Storgatan 12, Stockholm",
  },
  {
    id: "2",
    title: "Vattenläcka i källaren",
    description: "Det droppar vatten från taket i källarförrådet.",
    status: "in_progress",
    createdAt: "2026-04-15T08:30:00Z",
    createdBy: "Anna Svensson",
    propertyAddress: "Storgatan 12, Stockholm",
  },
];

export function getAllTickets(): Ticket[] {
  return tickets;
}

export function createTicket(data: Omit<Ticket, "id" | "createdAt">): Ticket {
  const newTicket: Ticket = {
    ...data,
    id: String(Date.now()),
    createdAt: new Date().toISOString(),
  };
  tickets = [newTicket, ...tickets];
  return newTicket;
}
