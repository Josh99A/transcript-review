-- AlterTable
ALTER TABLE "Earning" ADD COLUMN     "fixed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "fixedPay" INTEGER;
