-- AlterTable
ALTER TABLE "recurring_transactions" ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "recurring_transactions_isSuspended_idx" ON "recurring_transactions"("isSuspended");

-- CreateIndex
CREATE INDEX "transactions_isSuspended_idx" ON "transactions"("isSuspended");
