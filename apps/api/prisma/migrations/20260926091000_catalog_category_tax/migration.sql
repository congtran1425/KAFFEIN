-- VAT belongs to the product category. Products and toppings intentionally have
-- no tax override columns in the MVP.
CREATE TABLE "product_categories" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_categories_tax_rate_bps_check" CHECK ("tax_rate_bps" BETWEEN 0 AND 10000)
);

CREATE TABLE "products" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "category_id" BIGINT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_variants" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "product_id" BIGINT NOT NULL,
    "code" TEXT NOT NULL,
    "size_label" TEXT NOT NULL,
    "price_vnd" BIGINT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_variants_price_vnd_check" CHECK ("price_vnd" > 0)
);

CREATE TABLE "toppings" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_vnd" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "toppings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "toppings_price_vnd_check" CHECK ("price_vnd" >= 0)
);

CREATE TABLE "product_toppings" (
    "product_id" BIGINT NOT NULL,
    "topping_id" BIGINT NOT NULL,

    CONSTRAINT "product_toppings_pkey" PRIMARY KEY ("product_id", "topping_id")
);

CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");
CREATE INDEX "product_categories_is_active_sort_order_idx" ON "product_categories"("is_active", "sort_order");
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");
CREATE INDEX "products_category_id_is_active_idx" ON "products"("category_id", "is_active");
CREATE UNIQUE INDEX "product_variants_product_id_code_key" ON "product_variants"("product_id", "code");
CREATE INDEX "product_variants_product_id_is_active_idx" ON "product_variants"("product_id", "is_active");
CREATE UNIQUE INDEX "product_variants_one_default_per_product_idx"
    ON "product_variants"("product_id") WHERE "is_default" = true;
CREATE UNIQUE INDEX "toppings_code_key" ON "toppings"("code");
CREATE INDEX "product_toppings_topping_id_idx" ON "product_toppings"("topping_id");

ALTER TABLE "products"
    ADD CONSTRAINT "products_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_variants"
    ADD CONSTRAINT "product_variants_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_toppings"
    ADD CONSTRAINT "product_toppings_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_toppings"
    ADD CONSTRAINT "product_toppings_topping_id_fkey"
    FOREIGN KEY ("topping_id") REFERENCES "toppings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
