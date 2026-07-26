-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "supplier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "valid_until" TIMESTAMP(3),
    "labor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "material" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "supplier_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 25,
    "vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "decision_comment" TEXT,
    "decision_at" TIMESTAMP(3),
    "decision_by" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteDecision" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "previous_status" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comment" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resident_name" TEXT NOT NULL,
    "unit" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionRound" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "interval" TEXT NOT NULL DEFAULT 'monthly',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "next_due" TIMESTAMP(3) NOT NULL,
    "checklist" JSONB NOT NULL,
    "deviations" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Quote_company_id_created_at_idx" ON "Quote"("company_id", "created_at");
CREATE INDEX "Quote_company_id_property_id_idx" ON "Quote"("company_id", "property_id");
CREATE INDEX "Quote_company_id_status_idx" ON "Quote"("company_id", "status");
CREATE INDEX "Quote_created_by_id_idx" ON "Quote"("created_by_id");

CREATE INDEX "QuoteDecision_company_id_quote_id_created_at_idx" ON "QuoteDecision"("company_id", "quote_id", "created_at");
CREATE INDEX "QuoteDecision_quote_id_created_at_idx" ON "QuoteDecision"("quote_id", "created_at");
CREATE INDEX "QuoteDecision_actor_user_id_idx" ON "QuoteDecision"("actor_user_id");

CREATE INDEX "Booking_company_id_created_at_idx" ON "Booking"("company_id", "created_at");
CREATE INDEX "Booking_company_id_property_id_start_at_idx" ON "Booking"("company_id", "property_id", "start_at");
CREATE INDEX "Booking_company_id_resource_start_at_idx" ON "Booking"("company_id", "resource", "start_at");
CREATE INDEX "Booking_created_by_id_idx" ON "Booking"("created_by_id");

CREATE INDEX "InspectionRound_company_id_created_at_idx" ON "InspectionRound"("company_id", "created_at");
CREATE INDEX "InspectionRound_company_id_property_id_idx" ON "InspectionRound"("company_id", "property_id");
CREATE INDEX "InspectionRound_company_id_next_due_idx" ON "InspectionRound"("company_id", "next_due");
CREATE INDEX "InspectionRound_created_by_id_idx" ON "InspectionRound"("created_by_id");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuoteDecision" ADD CONSTRAINT "QuoteDecision_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteDecision" ADD CONSTRAINT "QuoteDecision_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteDecision" ADD CONSTRAINT "QuoteDecision_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InspectionRound" ADD CONSTRAINT "InspectionRound_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InspectionRound" ADD CONSTRAINT "InspectionRound_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InspectionRound" ADD CONSTRAINT "InspectionRound_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
