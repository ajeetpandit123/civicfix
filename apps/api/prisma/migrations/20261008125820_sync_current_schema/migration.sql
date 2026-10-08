/*
  Warnings:

  - You are about to drop the column `completionNotes` on the `ComplaintAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `reviewDecision` on the `ComplaintAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `reviewNote` on the `ComplaintAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `reviewedAt` on the `ComplaintAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `reviewedById` on the `ComplaintAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `submittedAt` on the `ComplaintAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `workCompleted` on the `ComplaintAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `workerId` on the `ComplaintAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `designation` on the `FieldWorkerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `employeeId` on the `FieldWorkerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `organization` on the `FieldWorkerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `designation` on the `OfficerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `employeeId` on the `OfficerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `officeLocation` on the `OfficerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `organization` on the `OfficerProfile` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ComplaintAssignment" DROP CONSTRAINT "ComplaintAssignment_reviewedById_fkey";

-- DropForeignKey
ALTER TABLE "ComplaintAssignment" DROP CONSTRAINT "ComplaintAssignment_workerId_fkey";

-- AlterTable
ALTER TABLE "ComplaintAssignment" DROP COLUMN "completionNotes",
DROP COLUMN "reviewDecision",
DROP COLUMN "reviewNote",
DROP COLUMN "reviewedAt",
DROP COLUMN "reviewedById",
DROP COLUMN "submittedAt",
DROP COLUMN "workCompleted",
DROP COLUMN "workerId";

-- AlterTable
ALTER TABLE "FieldWorkerProfile" DROP COLUMN "designation",
DROP COLUMN "employeeId",
DROP COLUMN "organization";

-- AlterTable
ALTER TABLE "OfficerProfile" DROP COLUMN "designation",
DROP COLUMN "employeeId",
DROP COLUMN "officeLocation",
DROP COLUMN "organization";
