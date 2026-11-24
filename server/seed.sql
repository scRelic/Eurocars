<<<<<<< HEAD
-- Optional demo data for a fresh database created with db.sql.
=======
-- Optional, manually applied demo data for a database created with db.sql.
>>>>>>> master
-- Demo accounts cannot sign in; the listings are fictional and have no photos.

BEGIN;

<<<<<<< HEAD
LOCK TABLE countries, users, car_brands, car_models, cars, car_features IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM countries) OR EXISTS (SELECT 1 FROM users)
        OR EXISTS (SELECT 1 FROM car_brands) OR EXISTS (SELECT 1 FROM car_models)
        OR EXISTS (SELECT 1 FROM cars) OR EXISTS (SELECT 1 FROM car_features) THEN
        RAISE EXCEPTION 'Demo seed requires empty countries, users, car_brands, car_models, cars and car_features tables.';
    END IF;
END $$;
=======
LOCK TABLE countries, users, car_brands, car_models, cars, car_features, car_feature_links
    IN SHARE ROW EXCLUSIVE MODE;
>>>>>>> master

INSERT INTO countries (code, name, currency) VALUES
    ('AT', 'Austria', 'EUR'), ('BE', 'Belgium', 'EUR'), ('BG', 'Bulgaria', 'BGN'),
    ('CH', 'Switzerland', 'CHF'), ('CY', 'Cyprus', 'EUR'), ('CZ', 'Czechia', 'CZK'),
    ('DE', 'Germany', 'EUR'), ('DK', 'Denmark', 'DKK'), ('EE', 'Estonia', 'EUR'),
    ('ES', 'Spain', 'EUR'), ('FI', 'Finland', 'EUR'), ('FR', 'France', 'EUR'),
    ('GB', 'United Kingdom', 'GBP'), ('GR', 'Greece', 'EUR'), ('HR', 'Croatia', 'EUR'),
    ('HU', 'Hungary', 'HUF'), ('IE', 'Ireland', 'EUR'), ('IS', 'Iceland', 'ISK'),
    ('IT', 'Italy', 'EUR'), ('LT', 'Lithuania', 'EUR'), ('LU', 'Luxembourg', 'EUR'),
    ('LV', 'Latvia', 'EUR'), ('MT', 'Malta', 'EUR'), ('NL', 'Netherlands', 'EUR'),
    ('NO', 'Norway', 'NOK'), ('PL', 'Poland', 'PLN'), ('PT', 'Portugal', 'EUR'),
    ('RO', 'Romania', 'RON'), ('SE', 'Sweden', 'SEK'), ('SI', 'Slovenia', 'EUR'),
<<<<<<< HEAD
    ('SK', 'Slovakia', 'EUR'), ('UA', 'Ukraine', 'UAH');

INSERT INTO car_brands (name, slug) VALUES
=======
    ('SK', 'Slovakia', 'EUR'), ('UA', 'Ukraine', 'UAH')
ON CONFLICT (code) DO NOTHING;

CREATE TEMP TABLE eurocars_demo_brands (name TEXT NOT NULL, slug TEXT NOT NULL) ON COMMIT DROP;

INSERT INTO eurocars_demo_brands (name, slug) VALUES
>>>>>>> master
    ('Audi', 'audi'), ('BMW', 'bmw'), ('Ford', 'ford'), ('Honda', 'honda'),
    ('Hyundai', 'hyundai'), ('Kia', 'kia'), ('Land Rover', 'land-rover'),
    ('Mazda', 'mazda'), ('Mercedes-Benz', 'mercedes-benz'), ('Nissan', 'nissan'),
    ('Peugeot', 'peugeot'), ('Porsche', 'porsche'), ('Renault', 'renault'),
    ('Skoda', 'skoda'), ('Tesla', 'tesla'), ('Toyota', 'toyota'),
    ('Volkswagen', 'volkswagen'), ('Volvo', 'volvo');

<<<<<<< HEAD
INSERT INTO car_models (brand_id, name, slug)
SELECT b.id, m.name, m.slug
FROM (VALUES
=======
INSERT INTO car_brands (name, slug)
SELECT name, slug FROM eurocars_demo_brands
ON CONFLICT DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM eurocars_demo_brands d
        JOIN car_brands b ON b.slug = d.slug
        WHERE b.name <> d.name
    ) THEN
        RAISE EXCEPTION 'Demo seed: a brand slug belongs to a different brand. Resolve the conflict before retrying.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM eurocars_demo_brands d
        WHERE NOT EXISTS (SELECT 1 FROM car_brands b WHERE b.name = d.name)
    ) THEN
        RAISE EXCEPTION 'Demo seed: a required brand could not be resolved.';
    END IF;
END $$;

CREATE TEMP TABLE eurocars_demo_models (brand_slug TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL) ON COMMIT DROP;

INSERT INTO eurocars_demo_models (brand_slug, name, slug) VALUES
>>>>>>> master
    ('audi', 'A4', 'a4'), ('audi', 'Q5', 'q5'),
    ('bmw', '3 Series', '3-series'), ('bmw', 'X5', 'x5'),
    ('ford', 'Focus', 'focus'), ('ford', 'Kuga', 'kuga'),
    ('honda', 'Civic', 'civic'), ('honda', 'CR-V', 'cr-v'),
    ('hyundai', 'Tucson', 'tucson'), ('hyundai', 'Ioniq 5', 'ioniq-5'),
    ('kia', 'Sportage', 'sportage'), ('kia', 'EV6', 'ev6'),
    ('land-rover', 'Discovery Sport', 'discovery-sport'), ('land-rover', 'Range Rover Evoque', 'range-rover-evoque'),
    ('mazda', 'Mazda3', 'mazda3'), ('mazda', 'CX-5', 'cx-5'),
    ('mercedes-benz', 'C-Class', 'c-class'), ('mercedes-benz', 'GLC', 'glc'),
    ('nissan', 'Qashqai', 'qashqai'), ('nissan', 'Leaf', 'leaf'),
    ('peugeot', '308', '308'), ('peugeot', '3008', '3008'),
    ('porsche', 'Macan', 'macan'), ('porsche', 'Cayenne', 'cayenne'),
    ('renault', 'Clio', 'clio'), ('renault', 'Captur', 'captur'),
    ('skoda', 'Octavia', 'octavia'), ('skoda', 'Kodiaq', 'kodiaq'),
    ('tesla', 'Model 3', 'model-3'), ('tesla', 'Model Y', 'model-y'),
    ('toyota', 'Corolla', 'corolla'), ('toyota', 'RAV4', 'rav4'),
    ('volkswagen', 'Golf', 'golf'), ('volkswagen', 'Tiguan', 'tiguan'),
<<<<<<< HEAD
    ('volvo', 'XC60', 'xc60'), ('volvo', 'V60', 'v60')
) AS m(brand_slug, name, slug)
JOIN car_brands b ON b.slug = m.brand_slug;
=======
    ('volvo', 'XC60', 'xc60'), ('volvo', 'V60', 'v60');

INSERT INTO car_models (brand_id, name, slug)
SELECT b.id, m.name, m.slug
FROM eurocars_demo_models m
JOIN eurocars_demo_brands d ON d.slug = m.brand_slug
JOIN car_brands b ON b.name = d.name
WHERE NOT EXISTS (
    SELECT 1 FROM car_models existing WHERE existing.brand_id = b.id AND existing.name = m.name
)
ON CONFLICT (brand_id, slug) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM eurocars_demo_models d
        JOIN eurocars_demo_brands db ON db.slug = d.brand_slug
        JOIN car_brands b ON b.name = db.name
        JOIN car_models m ON m.brand_id = b.id AND m.slug = d.slug
        WHERE m.name <> d.name
    ) THEN
        RAISE EXCEPTION 'Demo seed: a model slug belongs to a different model. Resolve the conflict before retrying.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM eurocars_demo_models d
        JOIN eurocars_demo_brands db ON db.slug = d.brand_slug
        JOIN car_brands b ON b.name = db.name
        WHERE (SELECT COUNT(*) FROM car_models m WHERE m.brand_id = b.id AND m.name = d.name) <> 1
    ) THEN
        RAISE EXCEPTION 'Demo seed: a model name is missing or ambiguous. Resolve the conflict before retrying.';
    END IF;
END $$;
>>>>>>> master

INSERT INTO car_features (name, category) VALUES
    ('Air conditioning', 'Comfort'),
    ('Heated seats', 'Comfort'),
    ('Navigation', 'Technology'),
    ('Bluetooth', 'Technology'),
    ('Parking sensors', 'Safety'),
    ('Rear view camera', 'Safety'),
    ('Cruise control', 'Driving'),
<<<<<<< HEAD
    ('LED headlights', 'Exterior');

INSERT INTO users (email, password_hash, first_name, last_name)
SELECT 'seller' || n || '@eurocars.example.invalid', '!demo-login-disabled', 'Demo', 'Seller ' || n
FROM generate_series(1, 8) AS n;
=======
    ('LED headlights', 'Exterior')
ON CONFLICT (name) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM users u
        JOIN generate_series(1, 8) AS n
            ON LOWER(u.email) = 'seller' || n || '@eurocars.example.invalid'
        WHERE u.password_hash <> '!demo-login-disabled'
            OR u.role <> 'USER' OR u.deleted_at IS NOT NULL OR u.account_status <> 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Demo seed: a reserved demo seller email is already used by another account or a modified demo account.';
    END IF;
END $$;

INSERT INTO users (email, password_hash, first_name, last_name)
SELECT 'seller' || n || '@eurocars.example.invalid', '!demo-login-disabled', 'Demo', 'Seller ' || n
FROM generate_series(1, 8) AS n
ON CONFLICT (LOWER(email)) DO NOTHING;
>>>>>>> master

INSERT INTO cars (
    seller_id, brand_id, model_id, title, description, price, currency, year, mileage,
    fuel_type, transmission, body_type, condition, engine_capacity_cc, power_hp,
    country_code, city, status, published_at, created_at, updated_at
)
SELECT u.id, b.id, m.id, 'Demo: ' || b.name || ' ' || m.name,
    'Demonstration listing only. This vehicle and seller are fictional.',
    v.price, v.currency, v.year, v.mileage, v.fuel, v.transmission, v.body_type,
    'USED', v.engine_cc, v.power_hp, v.country, v.city, 'ACTIVE',
    NOW() - v.age_days * INTERVAL '1 day', NOW() - v.age_days * INTERVAL '1 day',
    NOW() - v.age_days * INTERVAL '1 day'
FROM (VALUES
    (1, 'bmw', '3-series', 28900, 'EUR', 2021, 58000, 'DIESEL', 'AUTOMATIC', 'SEDAN', 1995, 190, 'DE', 'Berlin', 1),
    (2, 'bmw', 'x5', 54900, 'EUR', 2022, 42000, 'DIESEL', 'AUTOMATIC', 'SUV', 2993, 286, 'DE', 'Munich', 2),
    (3, 'audi', 'a4', 25900, 'EUR', 2020, 67000, 'PETROL', 'AUTOMATIC', 'SEDAN', 1984, 190, 'AT', 'Vienna', 3),
    (4, 'audi', 'q5', 38900, 'EUR', 2021, 51000, 'DIESEL', 'AUTOMATIC', 'SUV', 1968, 204, 'DE', 'Hamburg', 4),
    (5, 'mercedes-benz', 'c-class', 32900, 'EUR', 2021, 47000, 'PETROL', 'AUTOMATIC', 'SEDAN', 1991, 204, 'FR', 'Paris', 5),
    (6, 'volkswagen', 'golf', 19900, 'EUR', 2020, 61000, 'PETROL', 'MANUAL', 'HATCHBACK', 1498, 150, 'NL', 'Amsterdam', 6),
    (7, 'porsche', 'macan', 47900, 'EUR', 2020, 73000, 'PETROL', 'AUTOMATIC', 'SUV', 1984, 245, 'IT', 'Milan', 7),
    (8, 'toyota', 'rav4', 31500, 'EUR', 2022, 39000, 'HYBRID', 'AUTOMATIC', 'SUV', 2487, 218, 'FR', 'Lyon', 8),
    (1, 'skoda', 'octavia', 18400, 'EUR', 2020, 84000, 'DIESEL', 'MANUAL', 'WAGON', 1968, 150, 'CZ', 'Prague', 9),
    (2, 'volvo', 'xc60', 36500, 'EUR', 2021, 62000, 'DIESEL', 'AUTOMATIC', 'SUV', 1969, 197, 'SE', 'Stockholm', 10),
    (3, 'ford', 'focus', 16900, 'EUR', 2020, 52000, 'PETROL', 'MANUAL', 'HATCHBACK', 999, 125, 'ES', 'Madrid', 11),
    (4, 'renault', 'clio', 14900, 'EUR', 2022, 29000, 'PETROL', 'MANUAL', 'HATCHBACK', 999, 90, 'FR', 'Nice', 12),
    (5, 'peugeot', '3008', 24900, 'EUR', 2021, 56000, 'DIESEL', 'AUTOMATIC', 'SUV', 1499, 130, 'BE', 'Brussels', 13),
    (6, 'hyundai', 'tucson', 27900, 'EUR', 2022, 37000, 'HYBRID', 'AUTOMATIC', 'SUV', 1598, 230, 'ES', 'Barcelona', 14),
    (7, 'kia', 'sportage', 26900, 'EUR', 2022, 41000, 'PETROL', 'MANUAL', 'SUV', 1598, 150, 'PL', 'Warsaw', 15),
    (8, 'nissan', 'qashqai', 21900, 'EUR', 2021, 53000, 'PETROL', 'MANUAL', 'SUV', 1332, 140, 'IE', 'Dublin', 16),
    (1, 'tesla', 'model-3', 29900, 'EUR', 2021, 49000, 'ELECTRIC', 'AUTOMATIC', 'SEDAN', NULL, 283, 'NL', 'Rotterdam', 17),
    (2, 'land-rover', 'discovery-sport', 31900, 'GBP', 2020, 69000, 'DIESEL', 'AUTOMATIC', 'SUV', 1999, 180, 'GB', 'Manchester', 18),
    (3, 'mazda', 'cx-5', 23900, 'EUR', 2021, 44000, 'PETROL', 'AUTOMATIC', 'SUV', 1998, 165, 'DE', 'Cologne', 19),
    (4, 'honda', 'civic', 21500, 'CHF', 2020, 46000, 'PETROL', 'MANUAL', 'HATCHBACK', 1498, 182, 'CH', 'Zurich', 20)
) AS v(seller_number, brand_slug, model_slug, price, currency, year, mileage, fuel, transmission, body_type, engine_cc, power_hp, country, city, age_days)
<<<<<<< HEAD
JOIN users u ON u.email = 'seller' || v.seller_number || '@eurocars.example.invalid'
JOIN car_brands b ON b.slug = v.brand_slug
JOIN car_models m ON m.brand_id = b.id AND m.slug = v.model_slug;

INSERT INTO car_feature_links (car_id, feature_id)
SELECT c.id, f.id FROM cars c
CROSS JOIN car_features f
WHERE f.name IN ('Air conditioning', 'Bluetooth');

DO $$
BEGIN
    IF (SELECT count(*) FROM countries) <> 32 OR (SELECT count(*) FROM car_brands) <> 18
        OR (SELECT count(*) FROM car_models) <> 36 OR (SELECT count(*) FROM users) <> 8
        OR (SELECT count(*) FROM cars) <> 20 OR (SELECT count(*) FROM car_features) <> 8 THEN
        RAISE EXCEPTION 'Demo seed data is incomplete.';
    END IF;
END $$;
=======
JOIN users u ON LOWER(u.email) = 'seller' || v.seller_number || '@eurocars.example.invalid'
JOIN eurocars_demo_brands d ON d.slug = v.brand_slug
JOIN car_brands b ON b.name = d.name
JOIN eurocars_demo_models dm ON dm.brand_slug = v.brand_slug AND dm.slug = v.model_slug
JOIN car_models m ON m.brand_id = b.id AND m.name = dm.name
WHERE NOT EXISTS (
    SELECT 1 FROM cars existing
    WHERE existing.seller_id = u.id AND existing.model_id = m.id
);

INSERT INTO car_feature_links (car_id, feature_id)
SELECT c.id, f.id FROM cars c
JOIN users u ON u.id = c.seller_id
JOIN car_brands b ON b.id = c.brand_id
JOIN car_models m ON m.id = c.model_id AND m.brand_id = b.id
CROSS JOIN car_features f
WHERE f.name IN ('Air conditioning', 'Bluetooth')
    AND u.password_hash = '!demo-login-disabled'
    AND LOWER(u.email) IN (
        SELECT 'seller' || n || '@eurocars.example.invalid' FROM generate_series(1, 8) AS n
    )
    AND c.title = 'Demo: ' || b.name || ' ' || m.name
    AND c.description = 'Demonstration listing only. This vehicle and seller are fictional.'
ON CONFLICT (car_id, feature_id) DO NOTHING;
>>>>>>> master

COMMIT;
