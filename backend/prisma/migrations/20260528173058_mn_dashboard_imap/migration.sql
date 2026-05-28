/*
  Warnings:

  - You are about to drop the column `imapConfigurationId` on the `dashboards` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "dashboards" DROP CONSTRAINT "dashboards_imapConfigurationId_fkey";

-- AlterTable
ALTER TABLE "dashboards" DROP COLUMN "imapConfigurationId";

-- CreateTable
CREATE TABLE "_DashboardToImapConfiguration" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_DashboardToImapConfiguration_AB_unique" ON "_DashboardToImapConfiguration"("A", "B");

-- CreateIndex
CREATE INDEX "_DashboardToImapConfiguration_B_index" ON "_DashboardToImapConfiguration"("B");

-- AddForeignKey
ALTER TABLE "_DashboardToImapConfiguration" ADD CONSTRAINT "_DashboardToImapConfiguration_A_fkey" FOREIGN KEY ("A") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DashboardToImapConfiguration" ADD CONSTRAINT "_DashboardToImapConfiguration_B_fkey" FOREIGN KEY ("B") REFERENCES "imap_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
