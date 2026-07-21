-- AlterTable
ALTER TABLE "Link" ADD COLUMN     "previewPresetId" TEXT;

-- CreateTable
CREATE TABLE "PreviewPreset" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaImageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviewPreset_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_previewPresetId_fkey" FOREIGN KEY ("previewPresetId") REFERENCES "PreviewPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewPreset" ADD CONSTRAINT "PreviewPreset_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
