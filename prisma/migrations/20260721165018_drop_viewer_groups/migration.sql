/*
  Warnings:

  - You are about to drop the column `groupId` on the `Link` table. All the data in the column will be lost.
  - You are about to drop the `GroupPermission` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ViewerGroup` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ViewerGroupMember` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GroupPermission" DROP CONSTRAINT "GroupPermission_groupId_fkey";

-- DropForeignKey
ALTER TABLE "Link" DROP CONSTRAINT "Link_groupId_fkey";

-- DropForeignKey
ALTER TABLE "ViewerGroup" DROP CONSTRAINT "ViewerGroup_dataroomId_fkey";

-- DropForeignKey
ALTER TABLE "ViewerGroupMember" DROP CONSTRAINT "ViewerGroupMember_groupId_fkey";

-- AlterTable
ALTER TABLE "Link" DROP COLUMN "groupId";

-- DropTable
DROP TABLE "GroupPermission";

-- DropTable
DROP TABLE "ViewerGroup";

-- DropTable
DROP TABLE "ViewerGroupMember";
