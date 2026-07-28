-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('PAPERMARK');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('DRAFT', 'SCANNING', 'READY', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportItemKind" AS ENUM ('FOLDER', 'DOCUMENT', 'DATAROOM', 'DATAROOM_FOLDER', 'DATAROOM_DOCUMENT', 'LINK', 'DOMAIN', 'VISITOR');

-- CreateEnum
CREATE TYPE "ImportItemStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "Import" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL DEFAULT 'PAPERMARK',
    "status" "ImportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "tokenCipher" TEXT,
    "cookieCipher" TEXT,
    "sourceTeamId" TEXT,
    "plan" JSONB,
    "options" JSONB,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "doneItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "rootFolderId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),

    CONSTRAINT "Import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportItem" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "kind" "ImportItemKind" NOT NULL,
    "status" "ImportItemStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT NOT NULL,
    "externalName" TEXT NOT NULL,
    "localId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "caveats" JSONB,
    "meta" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Import_teamId_status_idx" ON "Import"("teamId", "status");

-- CreateIndex
CREATE INDEX "ImportItem_importId_status_idx" ON "ImportItem"("importId", "status");

-- CreateIndex
CREATE INDEX "ImportItem_importId_kind_idx" ON "ImportItem"("importId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ImportItem_importId_kind_externalId_key" ON "ImportItem"("importId", "kind", "externalId");

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "Import"("id") ON DELETE CASCADE ON UPDATE CASCADE;
