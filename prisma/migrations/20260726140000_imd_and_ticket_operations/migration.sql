CREATE TABLE "ImdReading" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "property_name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "meter_id" TEXT NOT NULL,
    "meter_type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "previous_reading" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "current_reading" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "consumption" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "charge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImdReading_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImdReading_company_id_created_at_idx" ON "ImdReading"("company_id", "created_at");
CREATE INDEX "ImdReading_company_id_property_id_meter_type_idx" ON "ImdReading"("company_id", "property_id", "meter_type");
CREATE INDEX "ImdReading_created_by_id_idx" ON "ImdReading"("created_by_id");

ALTER TABLE "ImdReading" ADD CONSTRAINT "ImdReading_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImdReading" ADD CONSTRAINT "ImdReading_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImdReading" ADD CONSTRAINT "ImdReading_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TicketOperation" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "description" TEXT,
    "minutes" INTEGER,
    "amount" DECIMAL(14,2),
    "completed" BOOLEAN,
    "ticket_title" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketOperation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketOperation_company_id_ticket_id_created_at_idx" ON "TicketOperation"("company_id", "ticket_id", "created_at");
CREATE INDEX "TicketOperation_ticket_id_operation_type_idx" ON "TicketOperation"("ticket_id", "operation_type");
CREATE INDEX "TicketOperation_created_by_id_idx" ON "TicketOperation"("created_by_id");

ALTER TABLE "TicketOperation" ADD CONSTRAINT "TicketOperation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketOperation" ADD CONSTRAINT "TicketOperation_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketOperation" ADD CONSTRAINT "TicketOperation_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
