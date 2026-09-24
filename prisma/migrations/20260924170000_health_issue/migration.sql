-- CreateTable
CREATE TABLE "HealthIssue" (
    "key" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastNotifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthIssue_pkey" PRIMARY KEY ("key")
);

