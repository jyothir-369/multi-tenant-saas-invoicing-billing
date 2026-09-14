-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "requires_signature" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "signature_name" TEXT,
ADD COLUMN "signature_email" TEXT,
ADD COLUMN "signed_at" TIMESTAMP(3);