CREATE TABLE checkout_rejections (
    sale_id UUID PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    request_hash TEXT NOT NULL,
    amount_vnd BIGINT NOT NULL CHECK (amount_vnd > 0),
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX checkout_rejections_device_id_created_at_idx ON checkout_rejections(device_id, created_at);
