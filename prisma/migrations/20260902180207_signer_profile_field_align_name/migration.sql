-- CreateEnum
CREATE TYPE "FieldAlign" AS ENUM ('LEFT', 'CENTER', 'RIGHT');

-- AlterEnum
ALTER TYPE "SignFieldKind" ADD VALUE 'NAME';

-- AlterTable
ALTER TABLE "SignatureField" ADD COLUMN     "align" "FieldAlign" NOT NULL DEFAULT 'LEFT';

-- CreateTable
CREATE TABLE "SignerProfile" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "signatureData" TEXT,
    "initialsData" TEXT,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "consentIp" TEXT,
    "consentUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignerProfile_email_key" ON "SignerProfile"("email");
