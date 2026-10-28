-- ADR 0015: reserve 1000001 for Owner, allocate staff from 1000701.
-- One controlled correction; normal employee-code updates remain forbidden.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE users IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF (SELECT count(*) FROM users WHERE role = 'OWNER') > 1 THEN
        RAISE EXCEPTION 'Employee code migration requires at most one Owner; review identities first';
    END IF;
    IF EXISTS (SELECT 1 FROM devices WHERE status = 'ACTIVE' AND has_pending_outbox) THEN
        RAISE EXCEPTION 'Employee code migration requires POS outboxes to be synchronized first';
    END IF;
END;
$$;

CREATE TEMP TABLE employee_codes_before ON COMMIT DROP AS
    SELECT id, employee_code FROM users
    WHERE role = 'OWNER' OR employee_code IS NULL OR employee_code < 1000701;

ALTER TABLE users DISABLE TRIGGER users_assign_employee_code;
ALTER TABLE users DROP CONSTRAINT users_role_home_store_check;

DO $$
DECLARE
    next_code bigint;
    employee record;
BEGIN
    -- Preserve both existing high codes and sequence values consumed by rollbacks.
    SELECT GREATEST(1000701,
        (SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END FROM employee_code_seq),
        COALESCE((SELECT max(employee_code) + 1 FROM users WHERE role <> 'OWNER'), 1000701))
    INTO next_code;
    FOR employee IN SELECT id FROM users
        WHERE role <> 'OWNER' AND (employee_code IS NULL OR employee_code < 1000701)
        ORDER BY id
    LOOP
        UPDATE users SET employee_code = next_code, updated_at = CURRENT_TIMESTAMP WHERE id = employee.id;
        next_code := next_code + 1;
    END LOOP;
    -- ALTER SEQUENCE RESTART is transactional, unlike setval().
    EXECUTE format('ALTER SEQUENCE employee_code_seq MINVALUE 1000701 START WITH 1000701 RESTART WITH %s', next_code);
END;
$$;

UPDATE users SET employee_code = 1000001, updated_at = CURRENT_TIMESTAMP
    WHERE role = 'OWNER' AND employee_code IS DISTINCT FROM 1000001;

ALTER TABLE users ALTER COLUMN employee_code SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_role_home_store_check CHECK (
    (role = 'OWNER' AND employee_code = 1000001 AND home_store_id IS NULL)
    OR (role IN ('STORE_MANAGER', 'EMPLOYEE')
        AND employee_code BETWEEN 1000701 AND 9999999 AND home_store_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION assign_employee_code() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'OWNER' THEN
            NEW.employee_code := 1000001;
        ELSE
            NEW.employee_code := nextval('employee_code_seq');
        END IF;
    ELSIF NEW.employee_code IS DISTINCT FROM OLD.employee_code THEN
        RAISE EXCEPTION 'employee_code is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE users ENABLE TRIGGER users_assign_employee_code;

INSERT INTO audit_logs (actor_type, store_id, action, entity_type, entity_id, metadata)
    SELECT 'SYSTEM', u.home_store_id, 'EMPLOYEE_CODE_REASSIGNED', 'USER', u.id::text,
        jsonb_build_object('previousCode', b.employee_code::text, 'employeeCode', u.employee_code::text,
            'reason', 'ADR-0015: reserve Owner code and staff range')
    FROM employee_codes_before b JOIN users u ON u.id = b.id
    WHERE b.employee_code IS DISTINCT FROM u.employee_code;

-- Delta clients receive the new code without clearing enrollment/checkpoints.
INSERT INTO sync_changes (store_id, entity_type, entity_id, change_type, payload)
    SELECT u.home_store_id, 'employees', u.id::text,
        CASE WHEN u.status = 'ACTIVE' THEN 'UPSERT' ELSE 'DELETE' END,
        jsonb_build_object('id', u.id::text, 'employeeCode', u.employee_code::text,
            'fullName', u.full_name, 'role', u.role, 'pinVersion', COALESCE(p.pin_version, 1))
    FROM employee_codes_before b JOIN users u ON u.id = b.id
    LEFT JOIN employee_pin_credentials p ON p.user_id = u.id
    WHERE u.role <> 'OWNER' AND b.employee_code IS DISTINCT FROM u.employee_code;
COMMIT;
