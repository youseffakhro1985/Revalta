-- Persistent, privacy-preserving request throttling shared by all serverless instances.
CREATE TABLE "RateLimitAttempt" (
    "id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateLimitAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitAttempt_key_hash_created_at_idx"
ON "RateLimitAttempt"("key_hash", "created_at");

CREATE INDEX "RateLimitAttempt_created_at_idx"
ON "RateLimitAttempt"("created_at");
