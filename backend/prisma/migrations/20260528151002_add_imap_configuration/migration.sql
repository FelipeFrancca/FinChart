-- DropIndex
DROP INDEX "transactions_costCenter_idx";

-- CreateTable
CREATE TABLE "imap_configurations" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL DEFAULT 'imap.gmail.com',
    "port" INTEGER NOT NULL DEFAULT 993,
    "emailUser" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dashboardId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imap_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imap_configurations_dashboardId_key" ON "imap_configurations"("dashboardId");

-- CreateIndex
CREATE INDEX "imap_configurations_isActive_idx" ON "imap_configurations"("isActive");

-- AddForeignKey
ALTER TABLE "imap_configurations" ADD CONSTRAINT "imap_configurations_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
