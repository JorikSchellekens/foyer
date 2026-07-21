-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('LOGIN', 'VIEWER_VERIFY', 'LINK_INVITE', 'TEAM_INVITE');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "PermissionLevel" AS ENUM ('VIEW', 'EDIT', 'MANAGE');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('DATAROOM', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PDF', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCX', 'SHEET', 'TEXT', 'NOTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('DATAROOM_DOCUMENT', 'DATAROOM_FOLDER');

-- CreateEnum
CREATE TYPE "LinkTarget" AS ENUM ('DOCUMENT', 'DATAROOM');

-- CreateEnum
CREATE TYPE "AccessMode" AS ENUM ('PUBLIC', 'EMAIL', 'EMAIL_VERIFIED');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('EMBEDDED', 'LINK', 'TEXT');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "email" TEXT NOT NULL,
    "context" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamInvite" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "invitedBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourcePermission" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "level" "PermissionLevel" NOT NULL DEFAULT 'VIEW',

    CONSTRAINT "ResourcePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "externalUrl" TEXT,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileKey" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "contentType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "numPages" INTEGER,
    "uploadedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataroom" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataroomFolder" (
    "id" TEXT NOT NULL,
    "dataroomId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataroomFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataroomDocument" (
    "id" TEXT NOT NULL,
    "dataroomId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "folderId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataroomDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewerGroup" (
    "id" TEXT NOT NULL,
    "dataroomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullAccess" BOOLEAN NOT NULL DEFAULT true,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewerGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "ViewerGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPermission" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "itemType" "ItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canDownload" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GroupPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "target" "LinkTarget" NOT NULL,
    "documentId" TEXT,
    "dataroomId" TEXT,
    "groupId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domainId" TEXT,
    "accessMode" "AccessMode" NOT NULL DEFAULT 'PUBLIC',
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "allowList" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockList" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "screenshotProtection" BOOLEAN NOT NULL DEFAULT false,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "agreementId" TEXT,
    "notifyOnAccess" BOOLEAN NOT NULL DEFAULT true,
    "enableIndexFile" BOOLEAN NOT NULL DEFAULT false,
    "enableQA" BOOLEAN NOT NULL DEFAULT false,
    "fullAccess" BOOLEAN NOT NULL DEFAULT true,
    "welcomeMessage" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaImageKey" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkPermission" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "itemType" "ItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canDownload" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LinkPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkRecipient" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viewer" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Viewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "View" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "viewerId" TEXT,
    "documentId" TEXT,
    "dataroomId" TEXT,
    "viewerEmail" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "agreementDone" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalDuration" INTEGER NOT NULL DEFAULT 0,
    "completedPct" INTEGER NOT NULL DEFAULT 0,
    "downloadedAt" TIMESTAMP(3),
    "ip" TEXT,
    "country" TEXT,
    "city" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "device" TEXT,

    CONSTRAINT "View_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "versionId" TEXT,
    "pageNumber" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MouseBatch" (
    "id" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "samples" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MouseBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requireName" BOOLEAN NOT NULL DEFAULT true,
    "type" "AgreementType" NOT NULL DEFAULT 'EMBEDDED',
    "fileKey" TEXT,
    "numPages" INTEGER,
    "externalUrl" TEXT,
    "content" TEXT,
    "fields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementResponse" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "signatureData" TEXT,
    "signedFileKey" TEXT,
    "ip" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branding" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "dataroomId" TEXT,
    "logoKey" TEXT,
    "bannerKey" TEXT,
    "brandColor" TEXT NOT NULL DEFAULT '#175B47',
    "backgroundColor" TEXT NOT NULL DEFAULT '#101418',
    "applyBgToDataroom" BOOLEAN NOT NULL DEFAULT false,
    "welcomeMessage" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaImageKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING',
    "verificationToken" TEXT NOT NULL,
    "cloudflareRecordId" TEXT,
    "cloudflareZoneId" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkPreset" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "partialKey" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataroomQuestion" (
    "id" TEXT NOT NULL,
    "dataroomId" TEXT NOT NULL,
    "viewerEmail" TEXT,
    "body" TEXT NOT NULL,
    "answer" TEXT,
    "answeredBy" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataroomQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE INDEX "VerificationToken_email_purpose_idx" ON "VerificationToken"("email", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvite_token_key" ON "TeamInvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvite_teamId_email_key" ON "TeamInvite"("teamId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ResourcePermission_memberId_resourceType_resourceId_key" ON "ResourcePermission"("memberId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "Folder_teamId_parentId_idx" ON "Folder"("teamId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_currentVersionId_key" ON "Document"("currentVersionId");

-- CreateIndex
CREATE INDEX "Document_teamId_folderId_idx" ON "Document"("teamId", "folderId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "DataroomFolder_dataroomId_parentId_idx" ON "DataroomFolder"("dataroomId", "parentId");

-- CreateIndex
CREATE INDEX "DataroomDocument_dataroomId_folderId_idx" ON "DataroomDocument"("dataroomId", "folderId");

-- CreateIndex
CREATE UNIQUE INDEX "DataroomDocument_dataroomId_documentId_key" ON "DataroomDocument"("dataroomId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ViewerGroupMember_groupId_email_key" ON "ViewerGroupMember"("groupId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPermission_groupId_itemType_itemId_key" ON "GroupPermission"("groupId", "itemType", "itemId");

-- CreateIndex
CREATE INDEX "Link_teamId_idx" ON "Link"("teamId");

-- CreateIndex
CREATE INDEX "Link_slug_idx" ON "Link"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Link_domainId_slug_key" ON "Link"("domainId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "LinkPermission_linkId_itemType_itemId_key" ON "LinkPermission"("linkId", "itemType", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkRecipient_token_key" ON "LinkRecipient"("token");

-- CreateIndex
CREATE UNIQUE INDEX "LinkRecipient_linkId_email_key" ON "LinkRecipient"("linkId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Viewer_teamId_email_key" ON "Viewer"("teamId", "email");

-- CreateIndex
CREATE INDEX "View_linkId_startedAt_idx" ON "View"("linkId", "startedAt");

-- CreateIndex
CREATE INDEX "View_viewerId_idx" ON "View"("viewerId");

-- CreateIndex
CREATE INDEX "View_documentId_idx" ON "View"("documentId");

-- CreateIndex
CREATE INDEX "View_dataroomId_idx" ON "View"("dataroomId");

-- CreateIndex
CREATE UNIQUE INDEX "PageView_viewId_pageNumber_key" ON "PageView"("viewId", "pageNumber");

-- CreateIndex
CREATE INDEX "MouseBatch_viewId_pageNumber_idx" ON "MouseBatch"("viewId", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Branding_dataroomId_key" ON "Branding"("dataroomId");

-- CreateIndex
CREATE UNIQUE INDEX "Branding_teamId_dataroomId_key" ON "Branding"("teamId", "dataroomId");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_domain_key" ON "Domain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_teamId_key_key" ON "NotificationPreference"("userId", "teamId", "key");

-- CreateIndex
CREATE INDEX "Notification_teamId_createdAt_idx" ON "Notification"("teamId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_hashedKey_key" ON "ApiToken"("hashedKey");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx" ON "WebhookDelivery"("webhookId", "createdAt");

-- CreateIndex
CREATE INDEX "DataroomQuestion_dataroomId_createdAt_idx" ON "DataroomQuestion"("dataroomId", "createdAt");

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourcePermission" ADD CONSTRAINT "ResourcePermission_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataroom" ADD CONSTRAINT "Dataroom_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataroomFolder" ADD CONSTRAINT "DataroomFolder_dataroomId_fkey" FOREIGN KEY ("dataroomId") REFERENCES "Dataroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataroomFolder" ADD CONSTRAINT "DataroomFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DataroomFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataroomDocument" ADD CONSTRAINT "DataroomDocument_dataroomId_fkey" FOREIGN KEY ("dataroomId") REFERENCES "Dataroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataroomDocument" ADD CONSTRAINT "DataroomDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataroomDocument" ADD CONSTRAINT "DataroomDocument_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DataroomFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewerGroup" ADD CONSTRAINT "ViewerGroup_dataroomId_fkey" FOREIGN KEY ("dataroomId") REFERENCES "Dataroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewerGroupMember" ADD CONSTRAINT "ViewerGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ViewerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPermission" ADD CONSTRAINT "GroupPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ViewerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_dataroomId_fkey" FOREIGN KEY ("dataroomId") REFERENCES "Dataroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ViewerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPermission" ADD CONSTRAINT "LinkPermission_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkRecipient" ADD CONSTRAINT "LinkRecipient_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewer" ADD CONSTRAINT "Viewer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "View" ADD CONSTRAINT "View_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "View" ADD CONSTRAINT "View_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "View" ADD CONSTRAINT "View_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "View" ADD CONSTRAINT "View_dataroomId_fkey" FOREIGN KEY ("dataroomId") REFERENCES "Dataroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageView" ADD CONSTRAINT "PageView_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "View"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageView" ADD CONSTRAINT "PageView_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouseBatch" ADD CONSTRAINT "MouseBatch_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "View"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementResponse" ADD CONSTRAINT "AgreementResponse_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementResponse" ADD CONSTRAINT "AgreementResponse_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "View"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branding" ADD CONSTRAINT "Branding_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branding" ADD CONSTRAINT "Branding_dataroomId_fkey" FOREIGN KEY ("dataroomId") REFERENCES "Dataroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkPreset" ADD CONSTRAINT "LinkPreset_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataroomQuestion" ADD CONSTRAINT "DataroomQuestion_dataroomId_fkey" FOREIGN KEY ("dataroomId") REFERENCES "Dataroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
