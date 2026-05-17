-- =============================================================
--  KEONBAE — Restaurant Stock Management System
--  PostgreSQL Schema with Seed Data
-- =============================================================

-- ---------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------
CREATE TYPE user_role AS ENUM (
    'administrator',
    'central_management',
    'restaurant_staff'
);

CREATE TYPE unit_type AS ENUM (
    'kg', 'g', 'litre', 'ml',
    'box', 'crate', 'piece', 'bag',
    'bottle', 'can'
);

CREATE TYPE item_category AS ENUM (
    'Meat', 'Seafood', 'Produce', 'Dairy',
    'Dry Goods', 'Sauces & Condiments', 'Oils',
    'Spices & Herbs', 'Fermented', 'Beverages',
    'Packaging', 'Cleaning Supplies'
);

CREATE TYPE order_status AS ENUM (
    'pending', 'approved', 'rejected',
    'dispatched', 'received', 'cancelled'
);

CREATE TYPE movement_direction AS ENUM ('IN', 'OUT');

CREATE TYPE movement_source AS ENUM (
    'order_dispatch', 'order_receipt', 'supplier_delivery',
    'manual_adjustment', 'wastage', 'transfer'
);

-- ---------------------------------------------------------------
-- 1. RESTAURANTS
-- ---------------------------------------------------------------
CREATE TABLE restaurants (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100)  NOT NULL,
    location      VARCHAR(200),
    contact_email VARCHAR(150),
    contact_phone VARCHAR(30),
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 2. USERS
-- ---------------------------------------------------------------
CREATE TABLE users (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id  UUID         REFERENCES restaurants(id) ON DELETE SET NULL,
    full_name      VARCHAR(100) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  TEXT         NOT NULL,
    role           user_role    NOT NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 3. ITEMS CATALOGUE
-- ---------------------------------------------------------------
CREATE TABLE items (
    id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(150)    NOT NULL UNIQUE,
    category     item_category   NOT NULL,
    unit         unit_type       NOT NULL,
    description  TEXT,
    is_active    BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 4. KITCHEN STOCK
-- ---------------------------------------------------------------
CREATE TABLE kitchen_stock (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id        UUID          NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity       NUMERIC(12,3) NOT NULL DEFAULT 0  CHECK (quantity >= 0),
    min_quantity   NUMERIC(12,3) NOT NULL DEFAULT 0  CHECK (min_quantity >= 0),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (item_id)
);

-- ---------------------------------------------------------------
-- 5. RESTAURANT STOCK
-- ---------------------------------------------------------------
CREATE TABLE restaurant_stock (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id  UUID          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    item_id        UUID          NOT NULL REFERENCES items(id)        ON DELETE RESTRICT,
    quantity       NUMERIC(12,3) NOT NULL DEFAULT 0  CHECK (quantity >= 0),
    min_quantity   NUMERIC(12,3) NOT NULL DEFAULT 0  CHECK (min_quantity >= 0),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (restaurant_id, item_id)
);

-- ---------------------------------------------------------------
-- 6. STOCK ORDERS
-- ---------------------------------------------------------------
CREATE TABLE stock_orders (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_ref         VARCHAR(20)   NOT NULL UNIQUE,
    restaurant_id     UUID          NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    requested_by      UUID          NOT NULL REFERENCES users(id)       ON DELETE RESTRICT,
    approved_by       UUID                   REFERENCES users(id)       ON DELETE SET NULL,
    dispatched_by     UUID                   REFERENCES users(id)       ON DELETE SET NULL,
    received_by       UUID                   REFERENCES users(id)       ON DELETE SET NULL,
    status            order_status  NOT NULL DEFAULT 'pending',
    notes             TEXT,
    needed_by_date    DATE,
    approved_at       TIMESTAMPTZ,
    dispatched_at     TIMESTAMPTZ,
    received_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE order_seq START 1;

CREATE OR REPLACE FUNCTION next_order_ref()
RETURNS TEXT LANGUAGE sql AS
$$
    SELECT 'KB-' || LPAD(nextval('order_seq')::TEXT, 4, '0');
$$;

-- ---------------------------------------------------------------
-- 7. ORDER LINE ITEMS
-- ---------------------------------------------------------------
CREATE TABLE order_items (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID          NOT NULL REFERENCES stock_orders(id) ON DELETE CASCADE,
    item_id             UUID          NOT NULL REFERENCES items(id)         ON DELETE RESTRICT,
    requested_quantity  NUMERIC(12,3) NOT NULL CHECK (requested_quantity > 0),
    approved_quantity   NUMERIC(12,3)           CHECK (approved_quantity >= 0),
    dispatched_quantity NUMERIC(12,3)           CHECK (dispatched_quantity >= 0),
    received_quantity   NUMERIC(12,3)           CHECK (received_quantity >= 0),
    notes               TEXT,
    UNIQUE (order_id, item_id)
);

-- ---------------------------------------------------------------
-- 8. STOCK MOVEMENT LOG (Audit Trail)
-- ---------------------------------------------------------------
CREATE TABLE stock_movements (
    id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id         UUID                NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    restaurant_id   UUID                         REFERENCES restaurants(id) ON DELETE SET NULL,
    order_id        UUID                         REFERENCES stock_orders(id) ON DELETE SET NULL,
    direction       movement_direction  NOT NULL,
    source          movement_source     NOT NULL,
    quantity        NUMERIC(12,3)       NOT NULL CHECK (quantity > 0),
    quantity_before NUMERIC(12,3)       NOT NULL,
    quantity_after  NUMERIC(12,3)       NOT NULL,
    performed_by    UUID                         REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 9. SUPPLIER DELIVERIES
-- ---------------------------------------------------------------
CREATE TABLE supplier_deliveries (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_name VARCHAR(150)  NOT NULL,
    received_by   UUID                   REFERENCES users(id) ON DELETE SET NULL,
    delivery_date DATE          NOT NULL DEFAULT CURRENT_DATE,
    notes         TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE supplier_delivery_items (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id     UUID          NOT NULL REFERENCES supplier_deliveries(id) ON DELETE CASCADE,
    item_id         UUID          NOT NULL REFERENCES items(id)               ON DELETE RESTRICT,
    quantity        NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit_cost       NUMERIC(10,2),
    UNIQUE (delivery_id, item_id)
);

-- =============================================================
-- TRIGGERS
-- =============================================================

-- Auto-set order_ref
CREATE OR REPLACE FUNCTION set_order_ref()
RETURNS TRIGGER LANGUAGE plpgsql AS
$$
BEGIN
    IF NEW.order_ref IS NULL OR NEW.order_ref = '' THEN
        NEW.order_ref := next_order_ref();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_order_ref
BEFORE INSERT ON stock_orders
FOR EACH ROW EXECUTE FUNCTION set_order_ref();

-- Keep updated_at current
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS
$$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON stock_orders
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_kitchen_stock_updated_at BEFORE UPDATE ON kitchen_stock
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_restaurant_stock_updated_at BEFORE UPDATE ON restaurant_stock
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Deduct kitchen stock on dispatch
CREATE OR REPLACE FUNCTION on_order_dispatched()
RETURNS TRIGGER LANGUAGE plpgsql AS
$$
DECLARE
    line     RECORD;
    old_qty  NUMERIC;
    new_qty  NUMERIC;
BEGIN
    IF OLD.status <> 'dispatched' AND NEW.status = 'dispatched' THEN
        FOR line IN
            SELECT oi.item_id,
                   COALESCE(oi.approved_quantity, oi.requested_quantity) AS qty
            FROM   order_items oi
            WHERE  oi.order_id = NEW.id
        LOOP
            SELECT quantity INTO old_qty FROM kitchen_stock WHERE item_id = line.item_id;

            IF old_qty IS NULL THEN
                RAISE EXCEPTION 'Item % not found in kitchen stock', line.item_id;
            END IF;
            IF old_qty < line.qty THEN
                RAISE EXCEPTION 'Insufficient kitchen stock: have %, need %', old_qty, line.qty;
            END IF;

            new_qty := old_qty - line.qty;
            UPDATE kitchen_stock SET quantity = new_qty WHERE item_id = line.item_id;

            INSERT INTO stock_movements
                (item_id, order_id, direction, source, quantity,
                 quantity_before, quantity_after, performed_by)
            VALUES
                (line.item_id, NEW.id, 'OUT', 'order_dispatch', line.qty,
                 old_qty, new_qty, NEW.dispatched_by);
        END LOOP;

        NEW.dispatched_at := NOW();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_dispatch BEFORE UPDATE ON stock_orders
FOR EACH ROW EXECUTE FUNCTION on_order_dispatched();

-- Add to restaurant stock on receipt
CREATE OR REPLACE FUNCTION on_order_received()
RETURNS TRIGGER LANGUAGE plpgsql AS
$$
DECLARE
    line    RECORD;
    old_qty NUMERIC;
    new_qty NUMERIC;
BEGIN
    IF OLD.status <> 'received' AND NEW.status = 'received' THEN
        FOR line IN
            SELECT oi.item_id,
                   COALESCE(oi.received_quantity, oi.dispatched_quantity,
                            oi.approved_quantity,  oi.requested_quantity) AS qty
            FROM   order_items oi
            WHERE  oi.order_id = NEW.id
        LOOP
            INSERT INTO restaurant_stock (restaurant_id, item_id, quantity)
            VALUES (NEW.restaurant_id, line.item_id, 0)
            ON CONFLICT (restaurant_id, item_id) DO NOTHING;

            SELECT quantity INTO old_qty
            FROM   restaurant_stock
            WHERE  restaurant_id = NEW.restaurant_id AND item_id = line.item_id;

            new_qty := old_qty + line.qty;

            UPDATE restaurant_stock SET quantity = new_qty
            WHERE restaurant_id = NEW.restaurant_id AND item_id = line.item_id;

            INSERT INTO stock_movements
                (item_id, restaurant_id, order_id, direction, source, quantity,
                 quantity_before, quantity_after, performed_by)
            VALUES
                (line.item_id, NEW.restaurant_id, NEW.id, 'IN', 'order_receipt', line.qty,
                 old_qty, new_qty, NEW.received_by);
        END LOOP;

        NEW.received_at := NOW();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_receive BEFORE UPDATE ON stock_orders
FOR EACH ROW EXECUTE FUNCTION on_order_received();

-- =============================================================
-- VIEWS
-- =============================================================

CREATE VIEW vw_kitchen_low_stock AS
SELECT  i.id AS item_id, i.name, i.category, i.unit,
        ks.quantity AS current_qty, ks.min_quantity AS min_qty,
        ks.min_quantity - ks.quantity AS shortfall
FROM    kitchen_stock ks
JOIN    items i ON i.id = ks.item_id
WHERE   ks.quantity < ks.min_quantity
ORDER BY shortfall DESC;

CREATE VIEW vw_restaurant_low_stock AS
SELECT  r.id AS restaurant_id, r.name AS restaurant,
        i.id AS item_id, i.name AS item, i.category, i.unit,
        rs.quantity AS current_qty, rs.min_quantity AS min_qty,
        rs.min_quantity - rs.quantity AS shortfall
FROM    restaurant_stock rs
JOIN    restaurants r ON r.id = rs.restaurant_id
JOIN    items       i ON i.id = rs.item_id
WHERE   rs.quantity < rs.min_quantity
ORDER BY r.name, shortfall DESC;

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX idx_stock_orders_restaurant ON stock_orders (restaurant_id);
CREATE INDEX idx_stock_orders_status     ON stock_orders (status);
CREATE INDEX idx_order_items_order       ON order_items  (order_id);
CREATE INDEX idx_stock_movements_item    ON stock_movements (item_id);
CREATE INDEX idx_stock_movements_created ON stock_movements (created_at DESC);

-- =============================================================
-- SEED DATA
-- =============================================================

-- Restaurants
INSERT INTO restaurants (id, name, location, contact_email) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Keonbae Central', 'London',     'central.branch@keonbae.com'),
    ('a0000000-0000-0000-0000-000000000002', 'Keonbae North',   'Manchester', 'north.branch@keonbae.com');

-- Users (passwords are bcrypt hashes)
-- admin@keonbae.com / admin123
-- central@keonbae.com / central123
-- staff.central@keonbae.com / staff123
-- staff.north@keonbae.com / staff123
INSERT INTO users (id, restaurant_id, full_name, email, password_hash, role) VALUES
    ('d0000000-0000-0000-0000-000000000001', NULL, 'System Administrator',
     'admin@keonbae.com',
     '$2b$12$jSFq8.GehrqVrIPqEDoOJOPjJEh3VnUdY.kvDgFvy/MFkSx8Td9zG',
     'administrator'),
    ('d0000000-0000-0000-0000-000000000002', NULL, 'Central Management',
     'central@keonbae.com',
     '$2b$12$VTcUkbHL0aF0pkjkH5o3wuHvI3.JRMU52aLI5O4WMcgYRq3IZdU2W',
     'central_management'),
    ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
     'Central Branch Staff', 'staff.central@keonbae.com',
     '$2b$12$xKB0nQ8.Kdq2gWUZIaKMLOlk4nGHHJxQTBkUSwM5L6dwBuwGo7BAi',
     'restaurant_staff'),
    ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002',
     'North Branch Staff', 'staff.north@keonbae.com',
     '$2b$12$xKB0nQ8.Kdq2gWUZIaKMLOlk4nGHHJxQTBkUSwM5L6dwBuwGo7BAi',
     'restaurant_staff');

-- Items
INSERT INTO items (id, name, category, unit) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Kimchi',              'Fermented',           'kg'),
    ('b0000000-0000-0000-0000-000000000002', 'Gochujang',           'Sauces & Condiments', 'kg'),
    ('b0000000-0000-0000-0000-000000000003', 'Bulgogi Beef',        'Meat',                'kg'),
    ('b0000000-0000-0000-0000-000000000004', 'Korean Pork Belly',   'Meat',                'kg'),
    ('b0000000-0000-0000-0000-000000000005', 'Sesame Oil',          'Oils',                'litre'),
    ('b0000000-0000-0000-0000-000000000006', 'Soy Sauce',           'Sauces & Condiments', 'litre'),
    ('b0000000-0000-0000-0000-000000000007', 'Rice (short grain)',  'Dry Goods',           'bag'),
    ('b0000000-0000-0000-0000-000000000008', 'Glass Noodles',       'Dry Goods',           'box'),
    ('b0000000-0000-0000-0000-000000000009', 'Tofu',                'Produce',             'crate'),
    ('b0000000-0000-0000-0000-000000000010', 'Bean Sprouts',        'Produce',             'kg'),
    ('b0000000-0000-0000-0000-000000000011', 'Spring Onions',       'Produce',             'kg'),
    ('b0000000-0000-0000-0000-000000000012', 'Garlic',              'Produce',             'kg'),
    ('b0000000-0000-0000-0000-000000000013', 'Soju',                'Beverages',           'bottle'),
    ('b0000000-0000-0000-0000-000000000014', 'Takeaway Boxes',      'Packaging',           'box');

-- Kitchen Stock
INSERT INTO kitchen_stock (item_id, quantity, min_quantity) VALUES
    ('b0000000-0000-0000-0000-000000000001', 200, 50),
    ('b0000000-0000-0000-0000-000000000002',  80, 30),
    ('b0000000-0000-0000-0000-000000000003', 150, 80),
    ('b0000000-0000-0000-0000-000000000004', 120, 60),
    ('b0000000-0000-0000-0000-000000000005',  45, 20),
    ('b0000000-0000-0000-0000-000000000006',  60, 25),
    ('b0000000-0000-0000-0000-000000000007',  35, 15),
    ('b0000000-0000-0000-0000-000000000008',  18,  8),
    ('b0000000-0000-0000-0000-000000000009',  12,  5),
    ('b0000000-0000-0000-0000-000000000010',  40, 20),
    ('b0000000-0000-0000-0000-000000000011',  25, 15),
    ('b0000000-0000-0000-0000-000000000012',  20, 10),
    ('b0000000-0000-0000-0000-000000000013', 100, 40),
    ('b0000000-0000-0000-0000-000000000014', 500, 200);

-- Restaurant Stock (Central Branch)
INSERT INTO restaurant_stock (restaurant_id, item_id, quantity, min_quantity) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 15, 10),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 25, 15),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005',  3,  4),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000007',  8,  3);

-- Restaurant Stock (North Branch)
INSERT INTO restaurant_stock (restaurant_id, item_id, quantity, min_quantity) VALUES
    ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 12, 10),
    ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 20, 15),
    ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000006',  2,  5),
    ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000010',  5, 10);
