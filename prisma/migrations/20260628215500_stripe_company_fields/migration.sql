-- AlterTable
ALTER TABLE "Company" ADD COLUMN "stripe_customer_id" TEXT;
ALTER TABLE "Company" ADD COLUMN "stripe_subscription_id" TEXT;
ALTER TABLE "Company" ADD COLUMN "subscription_status" TEXT;
