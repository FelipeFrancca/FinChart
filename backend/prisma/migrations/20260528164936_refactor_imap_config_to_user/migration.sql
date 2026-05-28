/*
  Warnings:

  - You are about to drop the column `dashboardId` on the `imap_configurations` table. All the data in the column will be lost.
  - Added the required column `userId` to the `imap_configurations` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "imap_configurations" DROP CONSTRAINT "imap_configurations_dashboardId_fkey";

-- DropIndex
DROP INDEX "imap_configurations_dashboardId_key";

-- AlterTable
ALTER TABLE "dashboards" ADD COLUMN     "imapConfigurationId" TEXT;

-- AlterTable
ALTER TABLE "imap_configurations" DROP COLUMN "dashboardId",
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "imap_configurations_userId_idx" ON "imap_configurations"("userId");

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_imapConfigurationId_fkey" FOREIGN KEY ("imapConfigurationId") REFERENCES "imap_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imap_configurations" ADD CONSTRAINT "imap_configurations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
