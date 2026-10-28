-- CreateTable
CREATE TABLE "stock_receipts" (
    "id" UUID NOT NULL,
    "store_id" BIGINT NOT NULL,
    "receipt_code" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "document_no" TEXT,
    "document_date" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "total_cost_vnd" BIGINT NOT NULL DEFAULT 0,
    "idempotency_key" TEXT,
    "note" TEXT,
    "rejection_reason" TEXT,
    "created_by_user_id" BIGINT NOT NULL,
    "reviewed_by_user_id" BIGINT,
    "posted_by_user_id" BIGINT,
    "posted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receipt_lines" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "ingredient_id" BIGINT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "received_quantity" DECIMAL(14,3) NOT NULL,
    "base_unit" TEXT NOT NULL,
    "unit_cost_vnd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total_vnd" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "validation_errors" TEXT,

    CONSTRAINT "stock_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "receipt_line_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipts_receipt_code_key" ON "stock_receipts"("receipt_code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipts_idempotency_key_key" ON "stock_receipts"("idempotency_key");

-- CreateIndex
CREATE INDEX "stock_receipts_store_id_status_idx" ON "stock_receipts"("store_id", "status");

-- CreateIndex
CREATE INDEX "stock_receipts_created_at_idx" ON "stock_receipts"("created_at");

-- CreateIndex
CREATE INDEX "stock_receipt_lines_receipt_id_idx" ON "stock_receipt_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "stock_receipt_lines_ingredient_id_idx" ON "stock_receipt_lines"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipt_lines_receipt_id_line_number_key" ON "stock_receipt_lines"("receipt_id", "line_number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_receipt_line_id_key" ON "stock_movements"("receipt_line_id");

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_posted_by_user_id_fkey" FOREIGN KEY ("posted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_lines" ADD CONSTRAINT "stock_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_lines" ADD CONSTRAINT "stock_receipt_lines_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_receipt_line_id_fkey" FOREIGN KEY ("receipt_line_id") REFERENCES "stock_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
