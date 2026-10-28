-- Cashier Sessions
CREATE TABLE "cashier_sessions" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "store_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "cashier_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cashier_sessions_status_check" CHECK ("status" IN ('ACTIVE', 'LOCKED', 'CLOSED', 'REVOKED'))
);

CREATE INDEX "cashier_sessions_device_id_ended_at_idx" ON "cashier_sessions"("device_id", "ended_at");
CREATE INDEX "cashier_sessions_user_id_status_idx" ON "cashier_sessions"("user_id", "status");
CREATE UNIQUE INDEX "cashier_sessions_one_active_per_device_idx" ON "cashier_sessions"("device_id") WHERE "ended_at" IS NULL;

-- Register Sessions (cash drawer shift)
CREATE TABLE "register_sessions" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "store_id" BIGINT NOT NULL,
    "opened_by_user_id" BIGINT NOT NULL,
    "closed_by_user_id" BIGINT,
    "opening_cash_vnd" BIGINT NOT NULL,
    "expected_cash_vnd" BIGINT,
    "actual_cash_vnd" BIGINT,
    "variance_vnd" BIGINT,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "register_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "register_sessions_status_check" CHECK ("status" IN ('OPEN', 'CLOSED')),
    CONSTRAINT "register_sessions_opening_cash_vnd_check" CHECK ("opening_cash_vnd" >= 0)
);

CREATE INDEX "register_sessions_device_id_closed_at_idx" ON "register_sessions"("device_id", "closed_at");
CREATE INDEX "register_sessions_store_id_opened_at_idx" ON "register_sessions"("store_id", "opened_at");
CREATE UNIQUE INDEX "register_sessions_one_open_per_device_idx" ON "register_sessions"("device_id") WHERE "closed_at" IS NULL;

-- Ingredients
CREATE TABLE "ingredients" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_unit" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ingredients_base_unit_check" CHECK ("base_unit" IN ('G', 'ML', 'PIECE'))
);

CREATE UNIQUE INDEX "ingredients_code_key" ON "ingredients"("code");

-- Recipe Versions & Recipe Items
CREATE TABLE "recipe_versions" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "product_variant_id" BIGINT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effective_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recipe_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recipe_versions_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'RETIRED')),
    CONSTRAINT "recipe_versions_version_no_check" CHECK ("version_no" > 0)
);

CREATE UNIQUE INDEX "recipe_versions_product_variant_id_version_no_key" ON "recipe_versions"("product_variant_id", "version_no");
CREATE INDEX "recipe_versions_product_variant_id_status_idx" ON "recipe_versions"("product_variant_id", "status");
CREATE UNIQUE INDEX "recipe_versions_one_active_per_variant_idx" ON "recipe_versions"("product_variant_id") WHERE "status" = 'ACTIVE';

CREATE TABLE "recipe_items" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "recipe_version_id" BIGINT NOT NULL,
    "ingredient_id" BIGINT NOT NULL,
    "quantity" NUMERIC(14, 3) NOT NULL,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recipe_items_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "recipe_items_recipe_version_id_ingredient_id_key" ON "recipe_items"("recipe_version_id", "ingredient_id");
CREATE INDEX "recipe_items_recipe_version_id_idx" ON "recipe_items"("recipe_version_id");
CREATE INDEX "recipe_items_ingredient_id_idx" ON "recipe_items"("ingredient_id");

-- Topping Items (formula for topping ingredient consumption)
CREATE TABLE "topping_items" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "topping_id" BIGINT NOT NULL,
    "ingredient_id" BIGINT NOT NULL,
    "quantity" NUMERIC(14, 3) NOT NULL,

    CONSTRAINT "topping_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "topping_items_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "topping_items_topping_id_ingredient_id_key" ON "topping_items"("topping_id", "ingredient_id");
CREATE INDEX "topping_items_topping_id_idx" ON "topping_items"("topping_id");
CREATE INDEX "topping_items_ingredient_id_idx" ON "topping_items"("ingredient_id");

-- Stock Balances
CREATE TABLE "stock_balances" (
    "store_id" BIGINT NOT NULL,
    "ingredient_id" BIGINT NOT NULL,
    "quantity" NUMERIC(14, 3) NOT NULL DEFAULT 0,
    "version" BIGINT NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("store_id", "ingredient_id"),
    CONSTRAINT "stock_balances_quantity_check" CHECK ("quantity" >= 0)
);

CREATE INDEX "stock_balances_ingredient_id_idx" ON "stock_balances"("ingredient_id");

-- Stock Movements (append-only)
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "store_id" BIGINT NOT NULL,
    "ingredient_id" BIGINT NOT NULL,
    "movement_type" TEXT NOT NULL,
    "quantity_delta" NUMERIC(14, 3) NOT NULL,
    "balance_after" NUMERIC(14, 3) NOT NULL,
    "sale_item_consumption_id" UUID,
    "performed_by_user_id" BIGINT,
    "source_operation_id" UUID,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_movements_movement_type_check" CHECK ("movement_type" IN ('RECEIPT', 'SALE_USAGE', 'ADJUSTMENT', 'WASTE')),
    CONSTRAINT "stock_movements_quantity_delta_check" CHECK ("quantity_delta" <> 0),
    CONSTRAINT "stock_movements_balance_after_check" CHECK ("balance_after" >= 0)
);

CREATE UNIQUE INDEX "stock_movements_sale_item_consumption_id_key" ON "stock_movements"("sale_item_consumption_id");
CREATE INDEX "stock_movements_store_id_ingredient_id_occurred_at_idx" ON "stock_movements"("store_id", "ingredient_id", "occurred_at");
CREATE INDEX "stock_movements_source_operation_id_idx" ON "stock_movements"("source_operation_id");

-- Sales
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "store_id" BIGINT NOT NULL,
    "device_id" UUID NOT NULL,
    "cashier_user_id" BIGINT NOT NULL,
    "register_session_id" UUID,
    "sale_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "subtotal_vnd" BIGINT NOT NULL,
    "tax_vnd" BIGINT NOT NULL,
    "total_vnd" BIGINT NOT NULL,
    "note" TEXT,
    "business_date" DATE NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMPTZ(3),

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_status_check" CHECK ("status" IN ('PAYMENT_PENDING', 'PAID', 'EXPIRED')),
    CONSTRAINT "sales_subtotal_vnd_check" CHECK ("subtotal_vnd" >= 0),
    CONSTRAINT "sales_tax_vnd_check" CHECK ("tax_vnd" >= 0),
    CONSTRAINT "sales_total_vnd_check" CHECK ("total_vnd" >= 0)
);

CREATE UNIQUE INDEX "sales_store_id_sale_number_key" ON "sales"("store_id", "sale_number");
CREATE INDEX "sales_store_id_business_date_idx" ON "sales"("store_id", "business_date");
CREATE INDEX "sales_device_id_created_at_idx" ON "sales"("device_id", "created_at");

-- Sale Items
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "product_id" BIGINT NOT NULL,
    "product_variant_id" BIGINT NOT NULL,
    "recipe_version_id" BIGINT,
    "product_name_snapshot" TEXT NOT NULL,
    "variant_name_snapshot" TEXT NOT NULL,
    "base_unit_price_vnd" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "tax_rate_bps_snapshot" INTEGER NOT NULL DEFAULT 0,
    "tax_amount_vnd" BIGINT NOT NULL DEFAULT 0,
    "subtotal_vnd" BIGINT NOT NULL,
    "line_total_vnd" BIGINT NOT NULL,
    "note" TEXT,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_items_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "sale_items_base_unit_price_vnd_check" CHECK ("base_unit_price_vnd" > 0),
    CONSTRAINT "sale_items_tax_rate_bps_snapshot_check" CHECK ("tax_rate_bps_snapshot" BETWEEN 0 AND 10000),
    CONSTRAINT "sale_items_tax_amount_vnd_check" CHECK ("tax_amount_vnd" >= 0),
    CONSTRAINT "sale_items_subtotal_vnd_check" CHECK ("subtotal_vnd" >= 0),
    CONSTRAINT "sale_items_line_total_vnd_check" CHECK ("line_total_vnd" >= 0)
);

CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");
CREATE INDEX "sale_items_product_id_idx" ON "sale_items"("product_id");

-- Sale Item Toppings
CREATE TABLE "sale_item_toppings" (
    "id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "topping_id" BIGINT NOT NULL,
    "topping_name_snapshot" TEXT NOT NULL,
    "unit_price_vnd_snapshot" BIGINT NOT NULL,
    "quantity_per_item" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sale_item_toppings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_item_toppings_quantity_per_item_check" CHECK ("quantity_per_item" > 0),
    CONSTRAINT "sale_item_toppings_unit_price_vnd_snapshot_check" CHECK ("unit_price_vnd_snapshot" >= 0)
);

CREATE UNIQUE INDEX "sale_item_toppings_sale_item_id_topping_id_key" ON "sale_item_toppings"("sale_item_id", "topping_id");
CREATE INDEX "sale_item_toppings_sale_item_id_idx" ON "sale_item_toppings"("sale_item_id");
CREATE INDEX "sale_item_toppings_topping_id_idx" ON "sale_item_toppings"("topping_id");

-- Sale Item Consumptions
CREATE TABLE "sale_item_consumptions" (
    "id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "ingredient_id" BIGINT NOT NULL,
    "ingredient_name_snapshot" TEXT NOT NULL,
    "unit_snapshot" TEXT NOT NULL,
    "quantity_per_item" NUMERIC(14, 3) NOT NULL,
    "quantity_total" NUMERIC(14, 3) NOT NULL,

    CONSTRAINT "sale_item_consumptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_item_consumptions_quantity_per_item_check" CHECK ("quantity_per_item" > 0),
    CONSTRAINT "sale_item_consumptions_quantity_total_check" CHECK ("quantity_total" > 0)
);

CREATE UNIQUE INDEX "sale_item_consumptions_sale_item_id_ingredient_id_key" ON "sale_item_consumptions"("sale_item_id", "ingredient_id");
CREATE INDEX "sale_item_consumptions_sale_item_id_idx" ON "sale_item_consumptions"("sale_item_id");
CREATE INDEX "sale_item_consumptions_ingredient_id_idx" ON "sale_item_consumptions"("ingredient_id");

-- Payments
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "store_id" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount_vnd" BIGINT NOT NULL,
    "merchant_order_id" TEXT,
    "provider_transaction_id" TEXT,
    "paid_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_method_check" CHECK ("method" IN ('CASH', 'ZALOPAY')),
    CONSTRAINT "payments_status_check" CHECK ("status" IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED')),
    CONSTRAINT "payments_amount_vnd_check" CHECK ("amount_vnd" > 0)
);

CREATE UNIQUE INDEX "payments_merchant_order_id_key" ON "payments"("merchant_order_id");
CREATE INDEX "payments_sale_id_idx" ON "payments"("sale_id");
CREATE INDEX "payments_store_id_status_idx" ON "payments"("store_id", "status");

-- Sync Operations
CREATE TABLE "sync_operations" (
    "operation_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "store_id" BIGINT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "result" JSONB,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "sync_operations_pkey" PRIMARY KEY ("operation_id"),
    CONSTRAINT "sync_operations_status_check" CHECK ("status" IN ('PROCESSING', 'COMPLETED', 'REJECTED'))
);

CREATE INDEX "sync_operations_device_id_operation_type_idx" ON "sync_operations"("device_id", "operation_type");
CREATE INDEX "sync_operations_store_id_received_at_idx" ON "sync_operations"("store_id", "received_at");

-- Sync Changes (Cursor Change Log)
CREATE TABLE "sync_changes" (
    "cursor" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "store_id" BIGINT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "change_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_changes_pkey" PRIMARY KEY ("cursor"),
    CONSTRAINT "sync_changes_change_type_check" CHECK ("change_type" IN ('UPSERT', 'DELETE'))
);

CREATE INDEX "sync_changes_store_id_cursor_idx" ON "sync_changes"("store_id", "cursor");

-- Device Sync Checkpoints
CREATE TABLE "device_sync_checkpoints" (
    "device_id" UUID NOT NULL,
    "last_cursor" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_sync_checkpoints_pkey" PRIMARY KEY ("device_id")
);

-- Foreign Key Constraints
ALTER TABLE "cashier_sessions"
    ADD CONSTRAINT "cashier_sessions_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cashier_sessions"
    ADD CONSTRAINT "cashier_sessions_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cashier_sessions"
    ADD CONSTRAINT "cashier_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "register_sessions"
    ADD CONSTRAINT "register_sessions_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_sessions"
    ADD CONSTRAINT "register_sessions_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_sessions"
    ADD CONSTRAINT "register_sessions_opened_by_user_id_fkey"
    FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_sessions"
    ADD CONSTRAINT "register_sessions_closed_by_user_id_fkey"
    FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipe_versions"
    ADD CONSTRAINT "recipe_versions_product_variant_id_fkey"
    FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipe_items"
    ADD CONSTRAINT "recipe_items_recipe_version_id_fkey"
    FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_items"
    ADD CONSTRAINT "recipe_items_ingredient_id_fkey"
    FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "topping_items"
    ADD CONSTRAINT "topping_items_topping_id_fkey"
    FOREIGN KEY ("topping_id") REFERENCES "toppings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topping_items"
    ADD CONSTRAINT "topping_items_ingredient_id_fkey"
    FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_balances"
    ADD CONSTRAINT "stock_balances_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_balances"
    ADD CONSTRAINT "stock_balances_ingredient_id_fkey"
    FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
    ADD CONSTRAINT "stock_movements_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements"
    ADD CONSTRAINT "stock_movements_ingredient_id_fkey"
    FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements"
    ADD CONSTRAINT "stock_movements_performed_by_user_id_fkey"
    FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements"
    ADD CONSTRAINT "stock_movements_sale_item_consumption_id_fkey"
    FOREIGN KEY ("sale_item_consumption_id") REFERENCES "sale_item_consumptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sales"
    ADD CONSTRAINT "sales_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales"
    ADD CONSTRAINT "sales_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales"
    ADD CONSTRAINT "sales_cashier_user_id_fkey"
    FOREIGN KEY ("cashier_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales"
    ADD CONSTRAINT "sales_register_session_id_fkey"
    FOREIGN KEY ("register_session_id") REFERENCES "register_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_items"
    ADD CONSTRAINT "sale_items_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items"
    ADD CONSTRAINT "sale_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items"
    ADD CONSTRAINT "sale_items_product_variant_id_fkey"
    FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items"
    ADD CONSTRAINT "sale_items_recipe_version_id_fkey"
    FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_item_toppings"
    ADD CONSTRAINT "sale_item_toppings_sale_item_id_fkey"
    FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_item_toppings"
    ADD CONSTRAINT "sale_item_toppings_topping_id_fkey"
    FOREIGN KEY ("topping_id") REFERENCES "toppings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_item_consumptions"
    ADD CONSTRAINT "sale_item_consumptions_sale_item_id_fkey"
    FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_item_consumptions"
    ADD CONSTRAINT "sale_item_consumptions_ingredient_id_fkey"
    FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments"
    ADD CONSTRAINT "payments_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sync_operations"
    ADD CONSTRAINT "sync_operations_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sync_operations"
    ADD CONSTRAINT "sync_operations_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sync_changes"
    ADD CONSTRAINT "sync_changes_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_sync_checkpoints"
    ADD CONSTRAINT "device_sync_checkpoints_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
