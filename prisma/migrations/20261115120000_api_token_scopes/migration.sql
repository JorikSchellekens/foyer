-- API tokens gain scopes and an optional expiry.
ALTER TABLE "ApiToken" ADD COLUMN "scopes" TEXT[] DEFAULT ARRAY['read']::TEXT[];
ALTER TABLE "ApiToken" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Tokens that already exist get "read" and "share". Before this change they
-- could read everything, create links and send invitations; "share" also
-- covers changing existing links. They do not gain the new abilities to add,
-- organise or delete, and from now on they act with their creator's current
-- role and data room permissions rather than team-wide.
UPDATE "ApiToken" SET "scopes" = ARRAY['read', 'share']::TEXT[];

-- CreateTable
CREATE TABLE "ApiTokenEvent" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "tokenId" TEXT,
    "tokenName" TEXT NOT NULL,
    "userId" TEXT,
    "tool" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiTokenEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUpload" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "name" TEXT,
    "folderId" TEXT,
    "dataroomId" TEXT,
    "dataroomFolderId" TEXT,
    "documentId" TEXT,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "resultDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiTokenEvent_teamId_createdAt_idx" ON "ApiTokenEvent"("teamId", "createdAt");
CREATE INDEX "ApiTokenEvent_tokenId_createdAt_idx" ON "ApiTokenEvent"("tokenId", "createdAt");
CREATE UNIQUE INDEX "ApiUpload_hashedSecret_key" ON "ApiUpload"("hashedSecret");
CREATE INDEX "ApiUpload_teamId_createdAt_idx" ON "ApiUpload"("teamId", "createdAt");

ALTER TABLE "ApiTokenEvent" ADD CONSTRAINT "ApiTokenEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiTokenEvent" ADD CONSTRAINT "ApiTokenEvent_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApiUpload" ADD CONSTRAINT "ApiUpload_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiUpload" ADD CONSTRAINT "ApiUpload_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ApiToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
