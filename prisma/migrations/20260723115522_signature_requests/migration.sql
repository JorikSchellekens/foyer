-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('DRAFT', 'SENT', 'COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('SIGNER', 'CC');

-- CreateEnum
CREATE TYPE "SignerStatus" AS ENUM ('PENDING', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED');

-- CreateEnum
CREATE TYPE "SignFieldKind" AS ENUM ('SIGNATURE', 'INITIALS', 'DATE_SIGNED', 'TEXT', 'CHECKBOX');

-- AlterEnum
ALTER TYPE "TokenPurpose" ADD VALUE 'SIGNER_VERIFY';

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "sequential" BOOLEAN NOT NULL DEFAULT false,
    "requireEmailVerification" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "reminderEveryDays" INTEGER,
    "lastReminderAt" TIMESTAMP(3),
    "createdById" TEXT,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "signedFileKey" TEXT,
    "finalHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signer" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "SignerRole" NOT NULL DEFAULT 'SIGNER',
    "order" INTEGER NOT NULL DEFAULT 0,
    "token" TEXT NOT NULL,
    "status" "SignerStatus" NOT NULL DEFAULT 'PENDING',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "signatureData" TEXT,
    "initialsData" TEXT,
    "viewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Signer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureField" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "kind" "SignFieldKind" NOT NULL,
    "page" INTEGER NOT NULL,
    "xPct" DOUBLE PRECISION NOT NULL,
    "yPct" DOUBLE PRECISION NOT NULL,
    "wPct" DOUBLE PRECISION NOT NULL,
    "hPct" DOUBLE PRECISION NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "value" TEXT,
    "filledAt" TIMESTAMP(3),

    CONSTRAINT "SignatureField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "signerId" TEXT,
    "type" TEXT NOT NULL,
    "meta" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignatureRequest_teamId_status_idx" ON "SignatureRequest"("teamId", "status");

-- CreateIndex
CREATE INDEX "SignatureRequest_documentId_idx" ON "SignatureRequest"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Signer_token_key" ON "Signer"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Signer_requestId_email_key" ON "Signer"("requestId", "email");

-- CreateIndex
CREATE INDEX "SignatureField_requestId_page_idx" ON "SignatureField"("requestId", "page");

-- CreateIndex
CREATE INDEX "SigningEvent_requestId_createdAt_idx" ON "SigningEvent"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signer" ADD CONSTRAINT "Signer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureField" ADD CONSTRAINT "SignatureField_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureField" ADD CONSTRAINT "SignatureField_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "Signer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningEvent" ADD CONSTRAINT "SigningEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningEvent" ADD CONSTRAINT "SigningEvent_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "Signer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
