-- Prisma does not model the employee-code sequence, CHECK constraints or
-- partial/expression indexes below. Keep them in this reviewed SQL migration.
CREATE SEQUENCE employee_code_seq AS BIGINT
    START WITH 1000001 MINVALUE 1000001 MAXVALUE 9999999 NO CYCLE;

-- CreateTable
CREATE TABLE "stores" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "business_timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "employee_code" BIGINT,
    "full_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "home_store_id" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- A trigger allocates only for non-Owner users. A column DEFAULT would also
-- allocate for Owner and is not faithfully represented by Prisma Migrate.
CREATE FUNCTION assign_employee_code() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.role <> 'OWNER' THEN
            NEW.employee_code := nextval('employee_code_seq');
        END IF;
    ELSIF NEW.employee_code IS DISTINCT FROM OLD.employee_code THEN
        RAISE EXCEPTION 'employee_code is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_assign_employee_code
    BEFORE INSERT OR UPDATE OF employee_code ON users
    FOR EACH ROW EXECUTE FUNCTION assign_employee_code();

-- CreateTable
CREATE TABLE "web_credentials" (
    "user_id" BIGINT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_credentials_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "employee_pin_credentials" (
    "user_id" BIGINT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "pin_version" INTEGER NOT NULL DEFAULT 1,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_pin_credentials_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "employee_store_transfers" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "user_id" BIGINT NOT NULL,
    "from_store_id" BIGINT NOT NULL,
    "to_store_id" BIGINT NOT NULL,
    "transferred_by_user_id" BIGINT NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_store_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "store_id" BIGINT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "credential_hash" TEXT NOT NULL,
    "credential_version" INTEGER NOT NULL DEFAULT 1,
    "app_version" TEXT,
    "last_heartbeat_at" TIMESTAMPTZ(3),
    "last_synced_at" TIMESTAMPTZ(3),
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_activation_codes" (
    "id" UUID NOT NULL,
    "store_id" BIGINT NOT NULL,
    "code_lookup" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "created_by_user_id" BIGINT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "used_by_device_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_activation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_user_id" BIGINT,
    "actor_device_id" UUID,
    "store_id" BIGINT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "request_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");

-- Only one enrolled ACTIVE POS per store; retain suspended/revoked history.
CREATE UNIQUE INDEX "devices_one_active_per_store_idx"
    ON "devices"("store_id") WHERE "status" = 'ACTIVE';

-- Email is unique regardless of letter case; not expressible in Prisma schema.
CREATE UNIQUE INDEX "web_credentials_email_ci_key"
    ON "web_credentials" (lower("email"));

-- CreateIndex
CREATE INDEX "users_home_store_id_status_idx" ON "users"("home_store_id", "status");

-- CreateIndex
CREATE INDEX "employee_store_transfers_user_id_effective_at_idx" ON "employee_store_transfers"("user_id", "effective_at");

-- CreateIndex
CREATE INDEX "employee_store_transfers_from_store_id_idx" ON "employee_store_transfers"("from_store_id");

-- CreateIndex
CREATE INDEX "employee_store_transfers_to_store_id_idx" ON "employee_store_transfers"("to_store_id");

-- CreateIndex
CREATE INDEX "employee_store_transfers_transferred_by_user_id_idx" ON "employee_store_transfers"("transferred_by_user_id");

-- CreateIndex
CREATE INDEX "devices_store_id_status_idx" ON "devices"("store_id", "status");

-- CreateIndex
CREATE INDEX "devices_last_heartbeat_at_idx" ON "devices"("last_heartbeat_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_activation_codes_code_lookup_key" ON "device_activation_codes"("code_lookup");

-- CreateIndex
CREATE INDEX "device_activation_codes_store_id_expires_at_idx" ON "device_activation_codes"("store_id", "expires_at");

-- CreateIndex
CREATE INDEX "device_activation_codes_created_by_user_id_idx" ON "device_activation_codes"("created_by_user_id");

-- CreateIndex
CREATE INDEX "device_activation_codes_used_by_device_id_idx" ON "device_activation_codes"("used_by_device_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_device_id_idx" ON "audit_logs"("actor_device_id");

-- CreateIndex
CREATE INDEX "audit_logs_store_id_created_at_idx" ON "audit_logs"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_home_store_id_fkey" FOREIGN KEY ("home_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_credentials" ADD CONSTRAINT "web_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_pin_credentials" ADD CONSTRAINT "employee_pin_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_store_transfers" ADD CONSTRAINT "employee_store_transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_store_transfers" ADD CONSTRAINT "employee_store_transfers_from_store_id_fkey" FOREIGN KEY ("from_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_store_transfers" ADD CONSTRAINT "employee_store_transfers_to_store_id_fkey" FOREIGN KEY ("to_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_store_transfers" ADD CONSTRAINT "employee_store_transfers_transferred_by_user_id_fkey" FOREIGN KEY ("transferred_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_activation_codes" ADD CONSTRAINT "device_activation_codes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_activation_codes" ADD CONSTRAINT "device_activation_codes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_activation_codes" ADD CONSTRAINT "device_activation_codes_used_by_device_id_fkey" FOREIGN KEY ("used_by_device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_device_id_fkey" FOREIGN KEY ("actor_device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain checks. Cross-table authorization remains in the service layer.
ALTER TABLE stores ADD CONSTRAINT stores_status_check
    CHECK (status IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE stores ADD CONSTRAINT stores_timezone_check
    CHECK (business_timezone = 'Asia/Ho_Chi_Minh');
ALTER TABLE users ADD CONSTRAINT users_role_home_store_check
    CHECK (
        (role = 'OWNER' AND employee_code IS NULL AND home_store_id IS NULL)
        OR
        (role IN ('STORE_MANAGER', 'EMPLOYEE')
            AND employee_code BETWEEN 1000001 AND 9999999
            AND home_store_id IS NOT NULL)
    );
ALTER TABLE users ADD CONSTRAINT users_status_check
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'TERMINATED'));
ALTER TABLE web_credentials ADD CONSTRAINT web_credentials_failed_attempts_check
    CHECK (failed_attempts >= 0);
ALTER TABLE employee_pin_credentials ADD CONSTRAINT employee_pin_credentials_counters_check
    CHECK (pin_version > 0 AND failed_attempts >= 0);
ALTER TABLE employee_store_transfers ADD CONSTRAINT employee_store_transfers_distinct_stores_check
    CHECK (from_store_id <> to_store_id);
ALTER TABLE devices ADD CONSTRAINT devices_status_check
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED'));
ALTER TABLE devices ADD CONSTRAINT devices_credential_version_check
    CHECK (credential_version > 0);
ALTER TABLE device_activation_codes ADD CONSTRAINT device_activation_codes_expiry_check
    CHECK (expires_at > created_at);
ALTER TABLE device_activation_codes ADD CONSTRAINT device_activation_codes_usage_check
    CHECK ((used_at IS NULL) = (used_by_device_id IS NULL));
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_check
    CHECK (
        (actor_type = 'USER' AND actor_user_id IS NOT NULL AND actor_device_id IS NULL)
        OR (actor_type = 'DEVICE' AND actor_user_id IS NULL AND actor_device_id IS NOT NULL)
        OR (actor_type = 'SYSTEM' AND actor_user_id IS NULL AND actor_device_id IS NULL)
    );
