"""Run against a new, temporary PostgreSQL cluster; never connects to DATABASE_URL."""

import http.client
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from itertools import chain
import json
import math
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import statistics
import subprocess
import tempfile
import threading
import time
from urllib.parse import quote
import uuid

ROOT = Path(__file__).resolve().parents[1]
PG_BIN = Path(os.environ["PG_BIN"])


class Comboboxes(HTMLParser):
    def __init__(self):
        super().__init__()
        self.controls = {}

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "button" and attributes.get("role") == "combobox":
            self.controls[attributes.get("aria-label")] = attributes


class SeoMetadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "meta":
            key = attributes.get("property") or attributes.get("name")
            if key:
                self.meta[key] = attributes.get("content")


def assert_social_metadata(page, title, description):
    metadata = SeoMetadata()
    metadata.feed(page.decode("utf-8"))
    assert metadata.meta.get("description") == description
    assert metadata.meta.get("og:title") == title
    assert metadata.meta.get("og:description") == description
    assert metadata.meta.get("twitter:card") == "summary"
    assert metadata.meta.get("twitter:title") == title
    assert metadata.meta.get("twitter:description") == description


def unused_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(port, method, path, body=None, cookie=None, extra_headers=None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
    headers = {"Host": f"localhost:{port}", "Origin": f"https://localhost:{port}", "Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    if extra_headers:
        headers.update(extra_headers)
    request_body = body if isinstance(body, bytes) else json.dumps(body) if body is not None else None
    connection.request(method, path, request_body, headers)
    response = connection.getresponse()
    result = (response.status, {key.lower(): value for key, value in response.getheaders()}, response.read())
    connection.close()
    return result


def expect(port, method, path, code, body=None, cookie=None, extra_headers=None):
    status, headers, result = request(port, method, path, body, cookie, extra_headers)
    assert status == code, (method, path, status, result[:1000])
    return headers, json.loads(result) if result and result[:1] == b"{" else result


def request_chunked(port, method, path, chunks, cookie, content_type):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=60)
    headers = {"Host": f"localhost:{port}", "Origin": f"https://localhost:{port}",
               "Content-Type": content_type, "Cookie": cookie}
    connection.request(method, path, chunks, headers, encode_chunked=True)
    response = connection.getresponse()
    result = (response.status, {key.lower(): value for key, value in response.getheaders()}, response.read())
    connection.close()
    return result


def multipart(fields, files, file_field="photos"):
    boundary = "EuroCarsTest" + secrets.token_hex(12)
    chunks = []
    for name, value in fields:
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode(),
            b"\r\n",
        ])
    for filename, data in files:
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode(),
            b"Content-Type: application/octet-stream\r\n\r\n",
            data,
            b"\r\n",
        ])
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), {"Content-Type": f"multipart/form-data; boundary={boundary}"}


def run():
    password = secrets.token_hex(24)
    with tempfile.TemporaryDirectory(prefix="eurocars-listings-test-") as directory:
        work = Path(directory)
        data = work / "database"
        password_file = work / "password"
        password_file.write_text(password, encoding="utf-8")
        subprocess.run([str(PG_BIN / "initdb"), "-D", str(data), "-U", "test_user",
                        "-A", "scram-sha-256", "--pwfile", str(password_file), "--no-instructions"],
                       check=True, capture_output=True)
        password_file.unlink()
        pg_port = unused_port()
        started = False
        server = None
        browser_server = None
        try:
            subprocess.run([str(PG_BIN / "pg_ctl"), "-D", str(data), "-l", str(work / "postgres.log"),
                            "-o", f"-p {pg_port} -h 127.0.0.1", "-w", "start"], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
            started = True
            pg_env = dict(os.environ, PGHOST="127.0.0.1", PGPORT=str(pg_port), PGUSER="test_user",
                          PGPASSWORD=password, PGSSLMODE="disable")
            subprocess.run([str(PG_BIN / "createdb"), "eurocars_test"], env=pg_env, check=True, capture_output=True)
            subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_test",
                            "-f", str(ROOT / "server" / "db.sql")], env=pg_env, check=True, capture_output=True)

            subprocess.run([str(PG_BIN / "createdb"), "eurocars_image_migration_test"], env=pg_env, check=True, capture_output=True)
            subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_image_migration_test",
                            "-c", """CREATE TABLE users (id BIGINT PRIMARY KEY, first_name TEXT, last_name TEXT,
                              email TEXT DEFAULT 'test@example.test', role TEXT DEFAULT 'USER', phone TEXT,
                              avatar_url TEXT, country_code TEXT, city TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
                              updated_at TIMESTAMPTZ DEFAULT NOW(), deleted_at TIMESTAMPTZ)"""], env=pg_env, check=True, capture_output=True)
            subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_image_migration_test",
                            "-f", str(ROOT / "server" / "migrations" / "007_image_upload_sessions.sql")],
                           env=pg_env, check=True, capture_output=True)
            subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_image_migration_test",
                            "-c", """CREATE TABLE cars (id BIGINT PRIMARY KEY, status TEXT NOT NULL);
                              CREATE TABLE car_images (id BIGINT PRIMARY KEY, car_id BIGINT NOT NULL REFERENCES cars(id),
                              image_url TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
                              is_primary BOOLEAN NOT NULL DEFAULT FALSE)"""], env=pg_env, check=True, capture_output=True)
            subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_image_migration_test",
                            "-f", str(ROOT / "server" / "migrations" / "008_listing_blob_images.sql")],
                           env=pg_env, check=True, capture_output=True)
            subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_image_migration_test",
                            "-c", """INSERT INTO users (id) VALUES (999);
                              INSERT INTO image_uploads (id,user_id,purpose,temporary_blob_pathname,expected_file_size,expected_mime_type,expires_at)
                                VALUES ('11111111-1111-4111-8111-111111111111',999,'LISTING','temp/999/legacy',100,'image/png',NOW()+INTERVAL '1 hour');
                              DROP TABLE image_upload_variants;
                              ALTER TABLE image_uploads DROP COLUMN processing_attempt, DROP COLUMN processing_started_at,
                                DROP COLUMN processing_attempts, DROP COLUMN consumed_avatar_url"""],
                           env=pg_env, check=True, capture_output=True)
            for _ in range(2):
                subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_image_migration_test",
                                "-f", str(ROOT / "server" / "migrations" / "009_complete_image_upload_sessions.sql")],
                               env=pg_env, check=True, capture_output=True)
            schema_query = """SELECT 'C|' || table_name || '|' || column_name || '|' ||
                                     data_type || '|' || is_nullable || '|' || COALESCE(column_default, '')
                              FROM information_schema.columns WHERE table_schema='public'
                                AND table_name IN ('image_uploads', 'image_delete_jobs', 'image_upload_variants', 'image_sync_jobs')
                              UNION ALL
                              SELECT 'K|' || c.relname || '|' || pg_get_constraintdef(k.oid)
                              FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
                              JOIN pg_namespace n ON n.oid=c.relnamespace
                              WHERE n.nspname='public' AND c.relname IN ('image_uploads', 'image_delete_jobs', 'image_upload_variants', 'image_sync_jobs')
                              ORDER BY 1"""
            def image_schema(database):
                return subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", database,
                                       "-tAc", schema_query], env=pg_env, check=True, capture_output=True, text=True).stdout.strip()

            assert image_schema("eurocars_test") == image_schema("eurocars_image_migration_test")
            preserved = subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_image_migration_test",
                                        "-tAc", "SELECT status || '|' || processing_attempts FROM image_uploads WHERE user_id=999"],
                                       env=pg_env, check=True, capture_output=True, text=True).stdout.strip()
            assert preserved == "PENDING|0"
            subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_image_migration_test",
                            "-c", "DELETE FROM image_uploads WHERE user_id=999; DELETE FROM users WHERE id=999"],
                           env=pg_env, check=True, capture_output=True)
            image_test_env = dict(os.environ, IMAGE_TEST_DATABASE_URL=(
                f"postgresql://test_user:{password}@127.0.0.1:{pg_port}/eurocars_image_migration_test"))
            subprocess.run(["node", "--test", str(ROOT / "tests" / "image-sessions.integration.mjs")],
                           cwd=ROOT, env=image_test_env, check=True, timeout=60)

            subprocess.run([str(PG_BIN / "createdb"), "eurocars_seed_test"], env=pg_env, check=True, capture_output=True)
<<<<<<< HEAD
            for script in ("db.sql", "seed.sql"):
                subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_seed_test",
                                "-f", str(ROOT / "server" / script)], env=pg_env, check=True, capture_output=True)
            seed_counts = """SELECT (SELECT COUNT(*) FROM countries), (SELECT COUNT(*) FROM car_brands),
                                    (SELECT COUNT(*) FROM car_models), (SELECT COUNT(*) FROM users),
                                    (SELECT COUNT(*) FROM cars), (SELECT COUNT(*) FROM car_images)"""
=======
            subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_seed_test",
                            "-f", str(ROOT / "server" / "db.sql")], env=pg_env, check=True, capture_output=True)
            def seed_sql(query):
                return subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_seed_test",
                                       "-tAc", query], env=pg_env, check=True, capture_output=True, text=True).stdout.strip()

            seed_sql("""INSERT INTO countries(code, name, currency) VALUES ('DE', 'Existing Germany', 'EUR');
                INSERT INTO users(email, password_hash, role) VALUES ('real@example.test', 'existing-hash', 'ADMIN');
                INSERT INTO car_brands(name, slug) VALUES ('BMW', 'existing-bmw');
                INSERT INTO car_models(brand_id, name, slug)
                    SELECT id, '3 Series', 'existing-series' FROM car_brands WHERE name = 'BMW';
                INSERT INTO car_features(name, category) VALUES ('Bluetooth', 'Existing category');
                INSERT INTO cars(seller_id, brand_id, model_id, title, price, year, mileage, fuel_type, transmission, country_code, city)
                    SELECT u.id, b.id, m.id, 'Real car', 100, 2020, 1000, 'PETROL', 'MANUAL', 'DE', 'Berlin'
                    FROM users u, car_brands b, car_models m
                    WHERE u.email = 'real@example.test' AND b.name = 'BMW' AND m.brand_id = b.id""")
            seed_path = str(ROOT / "server" / "seed.sql")
            subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_seed_test",
                            "-f", seed_path], env=pg_env, check=True, capture_output=True)
            seed_counts = """SELECT (SELECT COUNT(*) FROM countries), (SELECT COUNT(*) FROM car_brands),
                                    (SELECT COUNT(*) FROM car_models), (SELECT COUNT(*) FROM users),
                                    (SELECT COUNT(*) FROM cars), (SELECT COUNT(*) FROM car_images),
                                    (SELECT COUNT(*) FROM car_feature_links)"""
>>>>>>> master
            def seeded_counts():
                return subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_seed_test",
                                       "-tAc", seed_counts], env=pg_env, check=True, capture_output=True, text=True).stdout.strip()

<<<<<<< HEAD
            assert seeded_counts() == "32|18|36|8|20|0"
            second_seed = subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_seed_test",
                                          "-f", str(ROOT / "server" / "seed.sql")], env=pg_env, capture_output=True)
            assert second_seed.returncode != 0 and b"Demo seed requires empty" in second_seed.stderr
            assert seeded_counts() == "32|18|36|8|20|0"
=======
            assert seeded_counts() == "32|18|36|9|21|0|40"
            assert seed_sql("SELECT password_hash || '|' || role FROM users WHERE email = 'real@example.test'") == "existing-hash|ADMIN"
            assert seed_sql("SELECT name FROM countries WHERE code = 'DE'") == "Existing Germany"
            assert seed_sql("SELECT category FROM car_features WHERE name = 'Bluetooth'") == "Existing category"
            assert seed_sql("SELECT COUNT(*) FROM car_feature_links l JOIN cars c ON c.id=l.car_id WHERE c.title='Real car'") == "0"
            subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_seed_test",
                            "-f", seed_path], env=pg_env, check=True, capture_output=True)
            assert seeded_counts() == "32|18|36|9|21|0|40"
            seed_sql("UPDATE users SET password_hash='changed-hash' WHERE email='seller1@eurocars.example.invalid'")
            collision = subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_seed_test",
                                        "-f", seed_path], env=pg_env, capture_output=True)
            assert collision.returncode != 0 and b"reserved demo seller email" in collision.stderr
            assert seed_sql("SELECT password_hash FROM users WHERE email='seller1@eurocars.example.invalid'") == "changed-hash"
            assert seeded_counts() == "32|18|36|9|21|0|40"
>>>>>>> master

            def sql(query):
                return subprocess.run([str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "eurocars_test",
                                       "-tAc", query], env=pg_env, check=True, capture_output=True, text=True).stdout.strip()

            sql("""INSERT INTO countries(code,name) VALUES ('DE','Germany');
                   INSERT INTO car_brands(name,slug) VALUES ('BMW','bmw'), ('Audi','audi');
                   INSERT INTO car_models(brand_id,name,slug) VALUES (1,'3 Series','3-series'),(2,'A4','a4');
                   INSERT INTO car_features(name,category) VALUES ('Heated seats','Comfort'),('Navigation','Technology');""")
            port = unused_port()
            app_env = dict(os.environ, DATABASE_URL=f"postgresql://test_user:{password}@127.0.0.1:{pg_port}/eurocars_test",
                           SESSION_SECRET=secrets.token_hex(32), NITRO_HOST="127.0.0.1", NITRO_PORT=str(port),
                           BLOB_PRIVATE_READ_WRITE_TOKEN="vercel_blob_rw_test_fake",
                           NODE_ENV="production", LISTING_IMAGE_STORAGE_DIR=str(work / "private-listing-images"),
                           AVATAR_STORAGE_DIR=str(work / "private-avatars"))
            server = subprocess.Popen(["node", str(ROOT / ".output" / "server" / "index.mjs")], cwd=ROOT, env=app_env,
                                      stdout=None, stderr=None)
            for _ in range(100):
                if server.poll() is not None:
                    raise RuntimeError("The test server stopped before becoming ready.")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=1):
                        break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("The test server did not start.")

            def register(email):
                headers, result = expect(port, "POST", "/api/auth/register", 200,
                                         {"firstName": "Test", "lastName": "User", "email": email, "password": "test-password-123"})
                assert result["user"]["role"] == "USER"
                cookie_header = headers["set-cookie"].lower()
                assert "httponly" in cookie_header and "secure" in cookie_header and "samesite=lax" in cookie_header
                return headers["set-cookie"].split(";", 1)[0]

            owner = register("owner@example.test")
            stranger = register("stranger@example.test")
            admin = register("admin@example.test")
            sql("UPDATE users SET role='ADMIN' WHERE email='admin@example.test'")
            _, owner_session = expect(port, "GET", "/api/auth/me", 200, cookie=owner)
            _, admin_session = expect(port, "GET", "/api/auth/me", 200, cookie=admin)
            assert owner_session["user"]["role"] == "USER"
            assert admin_session["user"]["role"] == "ADMIN"
            prepare_image = {"purpose": "LISTING", "size": 1024, "contentType": "image/png"}
            expect(port, "POST", "/api/uploads/prepare", 401, prepare_image)
            expect(port, "POST", "/api/uploads/prepare", 400, {**prepare_image, "contentType": "image/svg+xml"}, owner)
            expect(port, "POST", "/api/uploads/prepare", 403, prepare_image, owner, {"Origin": "https://evil.example"})
            _, upload = expect(port, "POST", "/api/uploads/prepare", 200, prepare_image, owner)
            session_path = f"/api/uploads/{upload['id']}"
            expect(port, "GET", f"{session_path}/status", 404, cookie=stranger)
            _, upload_status = expect(port, "GET", f"{session_path}/status", 200, cookie=owner)
            assert upload_status["status"] == "PENDING"
            token_body = {"type": "blob.generate-client-token",
                          "payload": {"pathname": upload["pathname"], "clientPayload": upload["id"], "multipart": False}}
            expect(port, "POST", "/api/uploads/blob", 404, token_body, stranger)
            expect(port, "POST", "/api/uploads/blob", 400, {**token_body, "type": "blob.upload-completed"}, owner)
            expect(port, "POST", "/api/uploads/complete", 409, {"id": upload["id"]}, stranger)
            _, signed = expect(port, "POST", "/api/uploads/blob", 200, token_body, owner)
            assert signed["type"] == "blob.generate-client-token" and signed["clientToken"].startswith("vercel_blob_client_")
            assert "vercel_blob_rw_test_fake" not in signed["clientToken"]
            _, upload_status = expect(port, "GET", f"{session_path}/status", 200, cookie=owner)
            assert upload_status["status"] == "UPLOADING"
            expect(port, "DELETE", session_path, 404, cookie=stranger)
            expect(port, "DELETE", session_path, 204, cookie=owner)
            expect(port, "POST", "/api/uploads/blob", 404, token_body, owner)
            avatar_bytes = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000080000000808020000004b6d29dc0000000970485973000003e8000003e801b57b526b00000011494441540899637049ebc08a1886960400d37b4c81254b16660000000049454e44ae426082")
            avatar_body, avatar_headers = multipart([], [("avatar.png", avatar_bytes)], "photo")
            expect(port, "POST", "/api/users/me/avatar", 401, avatar_body, extra_headers=avatar_headers)
            invalid_body, invalid_headers = multipart([], [("avatar.png", b"<svg></svg>")], "photo")
            expect(port, "POST", "/api/users/me/avatar", 400, invalid_body, owner, invalid_headers)
            _, uploaded = expect(port, "POST", "/api/users/me/avatar", 200, avatar_body, owner, avatar_headers)
            avatar_path = uploaded["user"]["avatarUrl"]
            assert avatar_path.startswith(f"/api/users/{owner_session['user']['id']}/avatar/")
            headers, image = expect(port, "GET", avatar_path, 200, cookie=owner)
            assert image[:4] == b"RIFF" and image[8:12] == b"WEBP" and headers["content-type"].startswith("image/webp")
            corrupt_body, corrupt_headers = multipart([], [("avatar.png", avatar_bytes[:45])], "photo")
            expect(port, "POST", "/api/users/me/avatar", 400, corrupt_body, owner, corrupt_headers)
            expect(port, "GET", avatar_path, 200, cookie=owner)
            expect(port, "GET", avatar_path, 404)
            expect(port, "GET", avatar_path, 404, cookie=stranger)
            expect(port, "GET", avatar_path, 200, cookie=admin)
            _, owner_profile = expect(port, "PATCH", "/api/users/me", 200,
                                      {"firstName": "Test", "lastName": "User", "phone": "",
                                       "countryCode": "", "city": "", "avatarUrl": avatar_path}, owner)
            assert owner_profile["user"]["avatarUrl"] == avatar_path
            _, replaced = expect(port, "POST", "/api/users/me/avatar", 200, avatar_body, owner, avatar_headers)
            assert replaced["user"]["avatarUrl"] != avatar_path
            expect(port, "GET", avatar_path, 404, cookie=owner)
            _, admin_login = expect(port, "POST", "/api/auth/login", 200,
                                    {"email": "admin@example.test", "password": "test-password-123"})
            assert admin_login["user"]["role"] == "ADMIN"
            _, admin_profile = expect(port, "PATCH", "/api/auth/profile", 200,
                                      {"firstName": "Test", "lastName": "Admin"}, admin)
            assert admin_profile["user"]["role"] == "ADMIN"
            _, admin_profile = expect(port, "PATCH", "/api/users/me", 200,
                                      {"firstName": "Test", "lastName": "Admin", "phone": "",
                                       "countryCode": "", "city": "", "avatarUrl": ""}, admin)
            assert admin_profile["user"]["role"] == "ADMIN"
            expect(port, "GET", "/api/admin/access", 401)
            expect(port, "GET", "/api/admin/access", 403, cookie=owner)
            expect(port, "GET", "/api/admin/stats", 401)
            expect(port, "GET", "/api/admin/stats", 403, cookie=owner)
            _, admin_access = expect(port, "GET", "/api/admin/access", 200, cookie=admin)
            assert admin_access["user"]["email"] == "admin@example.test"
            _, empty_stats = expect(port, "GET", "/api/admin/stats", 200, cookie=admin)
            assert empty_stats["stats"]["totalUsers"] == 3 and empty_stats["stats"]["totalListings"] == 0
            assert len(empty_stats["listingTrend"]) == 30 and sum(day["count"] for day in empty_stats["listingTrend"]) == 0
            expect(port, "GET", "/api/admin/analytics", 401)
            expect(port, "GET", "/api/admin/analytics", 403, cookie=owner)
            expect(port, "GET", "/api/admin/health", 401)
            expect(port, "GET", "/api/admin/health", 403, cookie=owner)
            expect(port, "GET", "/api/admin/analytics?days=8", 400, cookie=admin)
            _, analytics = expect(port, "GET", "/api/admin/analytics?days=7", 200, cookie=admin)
            assert len(analytics["trend"]) == 7 and sum(day["users"] for day in analytics["trend"]) == 3
            assert not analytics["brands"] and not analytics["countries"] and not analytics["statuses"]
            _, health = expect(port, "GET", "/api/admin/health", 200, cookie=admin)
            assert health["database"]["status"] == "Healthy" and health["database"]["durationMs"] >= 0
            sql("INSERT INTO dealers(owner_id,name) VALUES (2,'Other dealer')")
            _, brands = expect(port, "GET", "/api/brands", 200)
            assert len(brands["items"]) == 2
            _, models = expect(port, "GET", "/api/brands/1/models", 200)
            assert models["items"][0]["name"] == "3 Series"
            expect(port, "GET", "/api/countries", 200)
            expect(port, "GET", "/api/features", 200)
            listing = {"brandId": "1", "modelId": "1", "dealerId": None, "title": "BMW 3 Series",
                       "trim": "Sport", "description": "Test listing", "price": 12345.50, "currency": "EUR",
                       "year": 2020, "mileage": 25000, "fuelType": "PETROL", "transmission": "MANUAL",
                       "bodyType": "SEDAN", "condition": "USED", "engineCapacityCc": 2000, "powerHp": 150,
                       "exteriorColor": "Blue", "interiorColor": "", "countryCode": "DE", "city": "Berlin",
                       "postalCode": "10115", "featureIds": ["1", "2"]}
            payload = {"listing": listing, "status": "DRAFT"}
            expect(port, "POST", "/api/cars", 401, payload, extra_headers={"Idempotency-Key": str(uuid.uuid4())})
            expect(port, "POST", "/api/cars", 400, dict(payload, status="ACTIVE"), owner, {"Idempotency-Key": str(uuid.uuid4())})
            expect(port, "POST", "/api/cars", 400, {"listing": dict(listing, sellerId="2"), "status": "DRAFT"}, owner, {"Idempotency-Key": str(uuid.uuid4())})
            expect(port, "POST", "/api/cars", 400, {"listing": dict(listing, modelId="2"), "status": "DRAFT"}, owner, {"Idempotency-Key": str(uuid.uuid4())})
            expect(port, "POST", "/api/cars", 400, {"listing": dict(listing, dealerId="1"), "status": "DRAFT"}, owner, {"Idempotency-Key": str(uuid.uuid4())})
            expect(port, "POST", "/api/cars", 400, {"listing": dict(listing, featureIds=["999"]), "status": "DRAFT"}, owner, {"Idempotency-Key": str(uuid.uuid4())})
            invalid_photo_body, invalid_photo_headers = multipart(
                [("listing", json.dumps(listing)), ("status", "DRAFT"),
                 ("imageOrder", json.dumps([{"kind": "upload", "index": 0, "isPrimary": True}]))],
                [("spoofed.png", b"<svg xmlns='http://www.w3.org/2000/svg'></svg>")],
            )
            expect(port, "POST", "/api/cars", 400, invalid_photo_body, owner,
                   {**invalid_photo_headers, "Idempotency-Key": str(uuid.uuid4())})
            boundary = "EuroCarsChunkedLimit"
            oversized_chunks = chain(
                [f"--{boundary}\r\nContent-Disposition: form-data; name=\"photos\"; filename=\"large.jpg\"\r\n\r\n".encode()],
                (b"x" * (1024 * 1024) for _ in range(82)),
                [f"\r\n--{boundary}--\r\n".encode()],
            )
            status, _, _ = request_chunked(port, "POST", "/api/cars", oversized_chunks, owner,
                                           f"multipart/form-data; boundary={boundary}")
            assert status == 413, ("oversized chunked upload", status)
            first_png = avatar_bytes
            second_png = avatar_bytes
            corrupt_photo_body, corrupt_photo_headers = multipart(
                [("listing", json.dumps(listing)), ("status", "DRAFT"),
                 ("imageOrder", json.dumps([{"kind": "upload", "index": 0, "isPrimary": True}]))],
                [("corrupt.png", first_png[:45])],
            )
            expect(port, "POST", "/api/cars", 400, corrupt_photo_body, owner,
                   {**corrupt_photo_headers, "Idempotency-Key": str(uuid.uuid4())})
            submission_key = str(uuid.uuid4())
            form_body, form_headers = multipart(
                [("listing", json.dumps(listing)), ("status", "DRAFT"),
                 ("imageOrder", json.dumps([
                     {"kind": "upload", "index": 0, "isPrimary": False},
                     {"kind": "upload", "index": 1, "isPrimary": True},
                 ]))],
                [("ignored-name.png", first_png), ("also-ignored.png", second_png)],
            )
            _, created = expect(port, "POST", "/api/cars", 201, form_body, owner,
                                {**form_headers, "Idempotency-Key": submission_key})
            car = created["listing"]
            assert car["status"] == "DRAFT" and car["featureIds"] == ["1", "2"] and car["price"] == 12345.5
            assert car["doors"] is None and car["seats"] is None and car["firstRegistration"] is None
            assert len(car["images"]) == 2 and car["images"][1]["isPrimary"]
            car_id = car["id"]
            path = f"/api/cars/{car_id}"

            def check_private_listing(identifier, expected_status, image_path=None):
                for cookie in (None, stranger, owner, admin):
                    expect(port, "GET", f"/api/cars/{identifier}", 404, cookie=cookie)
                    expect(port, "GET", f"/cars/{identifier}", 404, cookie=cookie)
                if image_path:
                    expect(port, "GET", image_path, 404)
                    expect(port, "GET", image_path, 404, cookie=stranger)
                    expect(port, "GET", image_path, 200, cookie=owner)
                    expect(port, "GET", image_path, 200, cookie=admin)
                expect(port, "GET", f"/api/users/me/cars/{identifier}", 401)
                expect(port, "GET", f"/api/users/me/cars/{identifier}", 404, cookie=stranger)
                _, own_listing = expect(port, "GET", f"/api/users/me/cars/{identifier}", 200, cookie=owner)
                assert own_listing["listing"]["status"] == expected_status
                expect(port, "GET", f"/api/admin/cars/{identifier}", 403, cookie=owner)
                _, admin_listing = expect(port, "GET", f"/api/admin/cars/{identifier}", 200, cookie=admin)
                assert admin_listing["listing"]["status"] == expected_status

            _, public_empty = expect(port, "GET", "/api/cars", 200)
            assert public_empty["total"] == 0 and not public_empty["items"]
            pending_payload = {"listing": dict(listing, title="Pending BMW"), "status": "PENDING"}
            pending_key = str(uuid.uuid4())
            _, pending_result = expect(port, "POST", "/api/cars", 201, pending_payload, owner,
                                       {"Idempotency-Key": pending_key})
            pending_id = pending_result["listing"]["id"]
            _, public_empty = expect(port, "GET", "/api/cars?search=BMW", 200)
            assert public_empty["total"] == 0 and not public_empty["items"]
            _, duplicate = expect(port, "POST", "/api/cars", 200, form_body, owner,
                                  {**form_headers, "Idempotency-Key": submission_key})
            assert duplicate["listing"]["id"] == car_id
            assert sql(f"SELECT COUNT(*) FROM cars WHERE seller_id = 1 AND title = 'BMW 3 Series'") == "1"
            first_image_id = car["images"][0]["id"]
            second_image_id = car["images"][1]["id"]
            image_path = f"/api/cars/{car_id}/images/{second_image_id}"
            check_private_listing(car_id, "DRAFT", image_path)
            check_private_listing(pending_id, "PENDING")
            image_headers, image_bytes = expect(port, "GET", image_path, 200, cookie=owner)
            assert image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP" and image_headers["content-type"].startswith("image/webp")
            expect(port, "GET", image_path, 404, cookie=stranger)
            expect(port, "GET", image_path, 404)
            expect(port, "GET", f"/api/users/me/cars/{car_id}", 404, cookie=stranger)
            expect(port, "PATCH", path, 404, {"status": "PENDING"}, stranger)
            expect(port, "DELETE", path, 404, cookie=stranger)
            expect(port, "PATCH", path, 400, {"status": "ACTIVE"}, owner)
            expect(port, "PATCH", path, 409, {"status": "SOLD"}, owner)
            expect(port, "PATCH", path, 400, {"listing": dict(listing, featureIds=["999"])}, owner)
            _, unchanged = expect(port, "GET", f"/api/users/me/cars/{car_id}", 200, cookie=owner)
            assert unchanged["listing"]["title"] == "BMW 3 Series" and unchanged["listing"]["featureIds"] == ["1", "2"]
            expect(port, "PATCH", path, 400, {"listing": dict(listing, doors=9)}, owner)
            expect(port, "PATCH", path, 400, {"listing": dict(listing, firstRegistration="2023-02-29")}, owner)
            _, draft_edited = expect(port, "PATCH", path, 200,
                                     {"listing": dict(listing, title="Edited draft", featureIds=["2"])}, owner)
            assert draft_edited["listing"]["status"] == "DRAFT"
            assert draft_edited["listing"]["title"] == "Edited draft"
            assert draft_edited["listing"]["featureIds"] == ["2"] and len(draft_edited["listing"]["images"]) == 2
            edited = dict(listing, title="Updated", featureIds=["2"], doors=4, seats=5, firstRegistration="2020-06-15")
            _, changed = expect(port, "PATCH", path, 200, {"listing": edited, "status": "PENDING"}, owner)
            assert changed["listing"]["title"] == "Updated" and changed["listing"]["featureIds"] == ["2"]
            assert changed["listing"]["status"] == "PENDING"
            assert (changed["listing"]["doors"], changed["listing"]["seats"], changed["listing"]["firstRegistration"]) == (4, 5, "2020-06-15")
            assert len(changed["listing"]["images"]) == 2 and changed["listing"]["images"][1]["isPrimary"]
            reorder_body, reorder_headers = multipart(
                [("listing", json.dumps(edited)),
                 ("imageOrder", json.dumps([{"kind": "existing", "id": first_image_id, "isPrimary": True}]))],
                [],
            )
            _, reordered = expect(port, "PATCH", path, 200, reorder_body, owner, reorder_headers)
            assert len(reordered["listing"]["images"]) == 1
            assert reordered["listing"]["images"][0]["id"] == first_image_id and reordered["listing"]["images"][0]["isPrimary"]
            expect(port, "GET", image_path, 404)
            retained_image_path = f"/api/cars/{car_id}/images/{first_image_id}"
            sql(f"UPDATE cars SET status='ACTIVE' WHERE id={int(car_id)}")
            _, public_active = expect(port, "GET", "/api/cars?brand=BMW&country=Germany&sort=price-asc", 200)
            assert public_active["total"] == 1 and public_active["items"][0]["id"] == car_id
            for query in ("minPrice=-1", "maxPrice=-1", "minPrice=20000&maxPrice=10000",
                          "page=0", "page=1.5", "limit=49", "sort=unknown"):
                expect(port, "GET", f"/api/cars?{query}", 400)
            for identifier in ("not-a-number", "9223372036854775808"):
                expect(port, "GET", f"/api/cars/{identifier}", 400)
            expect(port, "GET", "/api/cars/9223372036854775807", 404)
            for query in ("brand=Audi", "model=A4", "country=France", "minPrice=12346", "maxPrice=12345"):
                _, no_matches = expect(port, "GET", f"/api/cars?{query}", 200)
                assert no_matches["total"] == 0 and not no_matches["items"]
            _, matching = expect(port, "GET",
                                 "/api/cars?brand=BMW&model=3%20Series&country=Germany&minPrice=12345&maxPrice=12346&search=berlin",
                                 200)
            assert matching["total"] == 1 and matching["items"][0]["id"] == car_id
            _, injection_result = expect(port, "GET", "/api/cars?search=" + quote("' OR 1=1 --"), 200)
            assert injection_result["total"] == 0 and not injection_result["items"]
            _, out_of_range = expect(port, "GET", "/api/cars?page=2&limit=1", 200)
            assert out_of_range["total"] == 1 and out_of_range["page"] == 2 and not out_of_range["items"]
            _, public_detail = expect(port, "GET", f"/api/cars/{car_id}", 200)
            assert public_detail["car"]["seller"]["id"] == owner_session["user"]["id"]
            assert public_detail["car"]["seller"]["name"] == "Test User"
            assert public_detail["car"]["title"] == "Updated" and public_detail["car"]["condition"] == "USED"
            assert public_detail["car"]["featureGroups"] == [{"name": "Technology", "items": ["Navigation"]}]
            assert public_detail["car"]["views"] == 0
            expect(port, "POST", f"/api/cars/{pending_id}/view", 404)
            _, view = expect(port, "POST", f"/api/cars/{car_id}/view", 200)
            assert view["views"] == 1
            _, view = expect(port, "POST", f"/api/cars/{car_id}/view", 200, cookie=stranger)
            assert view["views"] == 2
            _, public_detail = expect(port, "GET", f"/api/cars/{car_id}", 200)
            assert public_detail["car"]["views"] == 2
            _, own_views = expect(port, "GET", "/api/users/me/cars", 200, cookie=owner)
            assert next(item for item in own_views["items"] if item["id"] == car_id)["views"] == 2
            expect(port, "GET", "/api/notifications", 401)
            expect(port, "GET", "/api/notifications/count", 401)
            expect(port, "PATCH", "/api/notifications/read", 401)
            expect(port, "GET", "/api/notifications?page=0", 400, cookie=owner)
            expect(port, "GET", replaced["user"]["avatarUrl"], 200)
            expect(port, "GET", "/api/conversations", 401)
            expect(port, "POST", "/api/conversations", 401, {"carId": car_id})
            expect(port, "POST", "/api/conversations", 400, {"carId": car_id}, owner)
            expect(port, "POST", "/api/conversations", 404, {"carId": pending_id}, stranger)
            _, conversation = expect(port, "POST", "/api/conversations", 200, {"carId": car_id}, stranger)
            conversation_id = conversation["id"]
            _, duplicate_conversation = expect(port, "POST", "/api/conversations", 200, {"carId": car_id}, stranger)
            assert duplicate_conversation["id"] == conversation_id
            message_path = f"/api/conversations/{conversation_id}/messages"
            expect(port, "GET", message_path, 404, cookie=admin)
            expect(port, "POST", message_path, 404, {"content": "Intrusion"}, admin)
            expect(port, "POST", message_path, 400, {"content": "Hi", "senderId": "1"}, stranger)
            expect(port, "POST", message_path, 400, {"content": "   "}, stranger)
            _, message = expect(port, "POST", message_path, 200, {"content": "Hello seller!"}, stranger)
            _, owner_notifications = expect(port, "GET", "/api/notifications", 200, cookie=owner)
            assert owner_notifications["items"][0]["type"] == "NEW_MESSAGE"
            notification_id = owner_notifications["items"][0]["id"]
            expect(port, "PATCH", f"/api/notifications/{notification_id}/read", 404, cookie=stranger)
            _, unread = expect(port, "GET", "/api/notifications/count", 200, cookie=owner)
            assert unread["count"] == 1
            expect(port, "POST", message_path, 200, {"content": "Hello buyer!"}, owner)
            _, latest = expect(port, "GET", message_path + "?limit=1", 200, cookie=owner)
            assert latest["hasMore"] and latest["items"][0]["content"] == "Hello buyer!"
            _, older = expect(port, "GET", message_path + f"?limit=1&before={latest['items'][0]['id']}", 200, cookie=owner)
            assert older["items"][0]["content"] == "Hello seller!"
            _, owner_inbox = expect(port, "GET", "/api/conversations", 200, cookie=owner)
            assert owner_inbox["items"][0]["unread"] == 1
            expect(port, "PATCH", f"/api/conversations/{conversation_id}/read", 404,
                   {"throughId": message["message"]["id"]}, admin)
            expect(port, "PATCH", f"/api/conversations/{conversation_id}/read", 200,
                   {"throughId": message["message"]["id"]}, owner)
            _, owner_inbox = expect(port, "GET", "/api/conversations", 200, cookie=owner)
            assert owner_inbox["items"][0]["unread"] == 0
            _, unread = expect(port, "GET", "/api/notifications/count", 200, cookie=owner)
            assert unread["count"] == 0
            _, analytics = expect(port, "GET", "/api/admin/analytics?days=30", 200, cookie=admin)
            assert len(analytics["trend"]) == 30 and sum(day["listings"] for day in analytics["trend"]) == 2
            assert analytics["brands"][0]["name"] == "BMW" and analytics["brands"][0]["count"] == 1
            assert analytics["countries"][0]["code"] == "DE" and analytics["countries"][0]["count"] == 1
            expect(port, "GET", "/api/favorites", 401)
            expect(port, "POST", f"/api/favorites/{car_id}", 401)
            expect(port, "POST", f"/api/favorites/{pending_id}", 404, cookie=owner)
            expect(port, "POST", "/api/favorites/not-an-id", 400, cookie=owner)
            _, saved = expect(port, "POST", f"/api/favorites/{car_id}", 200, cookie=owner)
            assert saved["car"]["id"] == car_id
            expect(port, "POST", f"/api/favorites/{car_id}", 200, cookie=owner)
            _, favorites = expect(port, "GET", "/api/favorites", 200, cookie=owner)
            assert len(favorites["items"]) == 1 and favorites["items"][0]["id"] == car_id
            _, stranger_favorites = expect(port, "GET", "/api/favorites", 200, cookie=stranger)
            assert not stranger_favorites["items"]
            expect(port, "DELETE", f"/api/favorites/{car_id}", 200, cookie=stranger)
            _, favorites = expect(port, "GET", "/api/favorites", 200, cookie=owner)
            assert len(favorites["items"]) == 1
            expect(port, "DELETE", f"/api/favorites/{car_id}", 200, cookie=owner)
            _, favorites = expect(port, "GET", "/api/favorites", 200, cookie=owner)
            assert not favorites["items"]
            expect(port, "POST", f"/api/favorites/{car_id}", 200, cookie=owner)
            _, dashboard_stats = expect(port, "GET", "/api/admin/stats", 200, cookie=admin)
            assert dashboard_stats["stats"]["totalListings"] == 2
            assert dashboard_stats["stats"]["activeListings"] == 1
            assert dashboard_stats["stats"]["pendingListings"] == 1
            assert sum(day["count"] for day in dashboard_stats["listingTrend"]) == 2
            assert len(dashboard_stats["pendingListings"]) == 1
            assert dashboard_stats["pendingListings"][0]["id"] == pending_id
            _, admin_page = expect(port, "GET", "/admin", 200, cookie=admin)
            assert b"Dashboard" in admin_page and b"Live database metrics" in admin_page
            assert b"Checking system..." in admin_page and b"Health check unavailable." not in admin_page
            status, headers, _ = request(port, "GET", "/admin", cookie=owner)
            assert status in (301, 302, 307, 308) and headers.get("location", "").endswith("/")
            status, headers, _ = request(port, "GET", "/admin")
            assert status in (301, 302, 307, 308) and "/login" in headers.get("location", "")
            expect(port, "GET", f"/api/cars/{car_id}", 200)
            expect(port, "GET", f"/api/cars/{pending_id}", 404)
            public_image_headers, public_image = expect(port, "GET", retained_image_path, 200)
            assert public_image[:4] == b"RIFF" and public_image[8:12] == b"WEBP" and public_image_headers["content-type"].startswith("image/webp")
            admin_image_headers, admin_image = expect(port, "GET", retained_image_path, 200, cookie=admin)
            assert admin_image == public_image and admin_image_headers["content-type"].startswith("image/webp")
            _, page = expect(port, "GET", "/cars", 200)
            assert b"BMW 3 Series" in page and b"Pending BMW" not in page
            assert re.search(rb'<html\b[^>]*\blang="en"', page) and b"<title>Car listings" in page
            assert_social_metadata(page, "Car listings — EuroCars",
                                   "Explore car listings and compare offers from across Europe.")
            _, page = expect(port, "GET", f"/cars/{car_id}", 200)
            assert b"BMW 3 Series" in page and b"Test listing" in page
            assert_social_metadata(page, "BMW 3 Series 2020 — EuroCars", "Test listing")
            _, page = expect(port, "GET", "/", 200)
            assert b"BMW 3 Series" in page and re.search(rb'<html\b[^>]*\blang="en"', page)
            assert_social_metadata(page, "EuroCars — Cars from across Europe",
                                   "Discover cars from sellers across Europe and find your next car on EuroCars.")
            expect(port, "GET", "/cars/not-an-id", 404)
            expect(port, "GET", "/cars/9223372036854775807", 404)
            expect(port, "GET", "/api/health", 200)
            _, changed = expect(port, "PATCH", path, 200, {"listing": dict(listing, title="Updated", featureIds=["2"])}, owner)
            assert changed["listing"]["status"] == "PENDING"
            _, favorites = expect(port, "GET", "/api/favorites", 200, cookie=owner)
            assert not favorites["items"]
            _, hidden_pending = expect(port, "GET", "/api/cars", 200)
            assert hidden_pending["total"] == 0
            assert (changed["listing"]["doors"], changed["listing"]["seats"], changed["listing"]["firstRegistration"]) == (4, 5, "2020-06-15")
            assert len(changed["listing"]["images"]) == 1
            _, cleared = expect(port, "PATCH", path, 200, {"listing": dict(edited, doors=None, seats=None, firstRegistration=None)}, owner)
            assert cleared["listing"]["doors"] is None and cleared["listing"]["seats"] is None and cleared["listing"]["firstRegistration"] is None
            sql(f"UPDATE cars SET status='ACTIVE' WHERE id={int(car_id)}")
            _, sold = expect(port, "PATCH", path, 200, {"status": "SOLD"}, owner)
            assert sold["listing"]["status"] == "SOLD"
            assert sold["listing"]["saleConfirmationStatus"] == "PENDING"
            check_private_listing(car_id, "SOLD", retained_image_path)
            expect(port, "GET", "/api/admin/moderation/sales", 401)
            expect(port, "GET", "/api/admin/moderation/sales", 403, cookie=owner)
            expect(port, "PATCH", f"/api/admin/moderation/sales/{car_id}", 403,
                   {"decision": "CONFIRM"}, owner)
            _, sale_queue = expect(port, "GET", "/api/admin/moderation/sales?page=1&limit=10", 200, cookie=admin)
            assert sale_queue["total"] == 1 and sale_queue["items"][0]["id"] == car_id
            expect(port, "PATCH", f"/api/admin/moderation/sales/{car_id}", 400,
                   {"decision": "REJECT"}, admin)
            _, rejected_sale = expect(port, "PATCH", f"/api/admin/moderation/sales/{car_id}", 200,
                                      {"decision": "REJECT", "reason": "Please verify the buyer details."}, admin)
            assert rejected_sale["listing"]["status"] == "ACTIVE"
            assert sql(f"SELECT sale_confirmation_status FROM cars WHERE id={int(car_id)}") == "REJECTED"
            _, own_after_rejection = expect(port, "GET", f"/api/users/me/cars/{car_id}", 200, cookie=owner)
            assert own_after_rejection["listing"]["saleConfirmationReason"] == "Please verify the buyer details."
            _, sold_again = expect(port, "PATCH", path, 200, {"status": "SOLD"}, owner)
            assert sold_again["listing"]["saleConfirmationStatus"] == "PENDING"
            _, confirmed_sale = expect(port, "PATCH", f"/api/admin/moderation/sales/{car_id}", 200,
                                       {"decision": "CONFIRM"}, admin)
            assert confirmed_sale["listing"]["status"] == "SOLD"
            assert sql(f"SELECT sale_confirmation_status FROM cars WHERE id={int(car_id)}") == "CONFIRMED"
            _, sale_notifications = expect(port, "GET", "/api/notifications", 200, cookie=owner)
            assert any(item["type"] == "SALE_REJECTED" and item["reason"] == "Please verify the buyer details."
                       for item in sale_notifications["items"])
            assert any(item["type"] == "SALE_CONFIRMED" for item in sale_notifications["items"])
            expect(port, "PATCH", f"/api/admin/moderation/sales/{car_id}", 409,
                   {"decision": "CONFIRM"}, admin)
            _, hidden_sold = expect(port, "GET", "/api/cars", 200)
            assert hidden_sold["total"] == 0
            expect(port, "DELETE", path, 200, cookie=owner)
            expect(port, "PATCH", path, 404, {"status": "PENDING"}, stranger)
            _, resubmitted = expect(port, "PATCH", path, 200, {"status": "PENDING"}, owner)
            assert resubmitted["listing"]["status"] == "PENDING"
            assert resubmitted["listing"]["saleConfirmationStatus"] == "NOT_REQUESTED"
            expect(port, "DELETE", path, 200, cookie=owner)
            check_private_listing(car_id, "ARCHIVED", retained_image_path)
            _, own = expect(port, "GET", "/api/users/me/cars", 200, cookie=owner)
            own_by_id = {item["id"]: item for item in own["items"]}
            assert own_by_id[car_id]["status"] == "ARCHIVED" and own_by_id[pending_id]["status"] == "PENDING"
            assert sql(f"SELECT COUNT(*) FROM cars WHERE id={int(car_id)}") == "1"
            _, page = expect(port, "GET", "/account/listings", 200, cookie=owner)
            assert b"Updated" in page and b"Archived" in page
            _, page = expect(port, "GET", "/sell", 200, cookie=owner)
            assert b"Tell us about your car" in page and b"Brand" in page and b"Continue" in page
            selects = Comboboxes()
            selects.feed(page.decode("utf-8"))
            assert selects.controls["Brand"]["aria-required"] == "true"
            assert "disabled" in selects.controls["Model"] and selects.controls["Model"]["aria-required"] == "true"
            assert "Condition" in selects.controls and "Body type" in selects.controls
            _, page = expect(port, "GET", f"/account/listing-edit/{car_id}", 200, cookie=owner)
            assert b"Back to listings" in page and b"Updated" in page and b"Tell us about your car" in page

            _, car_filter = expect(port, "GET", "/api/admin/cars?search=BMW&status=PENDING&country=DE&page=1&limit=1", 200, cookie=admin)
            assert car_filter["total"] == 1 and car_filter["items"][0]["id"] == pending_id
            assert car_filter["totalPages"] == 1 and len(car_filter["items"]) == 1
            _, admin_car = expect(port, "GET", f"/api/admin/cars/{pending_id}", 200, cookie=admin)
            assert admin_car["listing"]["description"] == "Test listing"
            assert admin_car["listing"]["features"] == ["Heated seats", "Navigation"]
            expect(port, "GET", "/api/admin/cars", 401)
            expect(port, "PATCH", f"/api/admin/cars/{pending_id}/status", 403, {"status": "ACTIVE"}, owner)
            _, approved = expect(port, "PATCH", f"/api/admin/cars/{pending_id}/status", 200, {"status": "ACTIVE"}, admin)
            assert approved["listing"]["status"] == "ACTIVE" and approved["listing"]["publishedAt"]
            assert approved["listing"]["reviewedBy"] == "3"
            assert sql(f"SELECT COUNT(*) FROM cars WHERE id={int(pending_id)} AND status='ACTIVE' AND published_at IS NOT NULL AND reviewed_by=3") == "1"

            reject_key = str(uuid.uuid4())
            _, reject_car = expect(port, "POST", "/api/cars", 201, {"listing": dict(listing, title="Reject me"), "status": "PENDING"}, owner,
                                   {"Idempotency-Key": reject_key})
            rejected_id = reject_car["listing"]["id"]
            expect(port, "PATCH", f"/api/admin/cars/{rejected_id}/status", 400, {"status": "REJECTED"}, admin)
            _, rejected = expect(port, "PATCH", f"/api/admin/cars/{rejected_id}/status", 200,
                                 {"status": "REJECTED", "reason": "Please provide clearer vehicle photos."}, admin)
            assert rejected["listing"]["status"] == "REJECTED"
            assert rejected["listing"]["moderationReason"] == "Please provide clearer vehicle photos."
            check_private_listing(rejected_id, "REJECTED")
            _, owner_notifications = expect(port, "GET", "/api/notifications", 200, cookie=owner)
            assert any(item["type"] == "LISTING_APPROVED" for item in owner_notifications["items"])
            rejection = next(item for item in owner_notifications["items"] if item["type"] == "LISTING_REJECTED")
            assert rejection["reason"] == "Please provide clearer vehicle photos." and rejection["readAt"] is None
            expect(port, "PATCH", f"/api/notifications/{rejection['id']}/read", 200, cookie=owner)
            sql(f"""INSERT INTO notifications(user_id,type,car_id)
                    SELECT 1,'LISTING_APPROVED',{int(pending_id)} FROM generate_series(1,25)""")
            _, first_notifications = expect(port, "GET", "/api/notifications?page=1", 200, cookie=owner)
            _, second_notifications = expect(port, "GET", "/api/notifications?page=2", 200, cookie=owner)
            assert len(first_notifications["items"]) == 20 and first_notifications["hasMore"]
            ids = [item["id"] for item in first_notifications["items"] + second_notifications["items"]]
            assert len(ids) == len(set(ids)) and len(second_notifications["items"]) > 0
            expect(port, "PATCH", "/api/notifications/read", 200, cookie=owner)
            _, unread = expect(port, "GET", "/api/notifications/count", 200, cookie=owner)
            assert unread["count"] == 0
            _, archived_by_admin = expect(port, "PATCH", f"/api/admin/cars/{rejected_id}/status", 200,
                                          {"status": "ARCHIVED"}, admin)
            assert archived_by_admin["listing"]["status"] == "ARCHIVED"
            expect(port, "PATCH", f"/api/admin/cars/{rejected_id}/status", 409, {"status": "ACTIVE"}, admin)

            _, dealers = expect(port, "GET", "/api/admin/dealers?verified=UNVERIFIED&search=Other", 200, cookie=admin)
            assert dealers["total"] == 1 and dealers["items"][0]["id"] == "1"
            expect(port, "PATCH", "/api/admin/dealers/1/verification", 403, {"verified": True}, owner)
            _, verified = expect(port, "PATCH", "/api/admin/dealers/1/verification", 200, {"verified": True}, admin)
            assert verified["dealer"]["isVerified"] is True
            _, unverified = expect(port, "PATCH", "/api/admin/dealers/1/verification", 200, {"verified": False}, admin)
            assert unverified["dealer"]["isVerified"] is False

            _, users = expect(port, "GET", "/api/admin/users?search=stranger&status=ACTIVE", 200, cookie=admin)
            assert users["total"] == 1 and users["items"][0]["email"] == "stranger@example.test"
            assert not {"password_hash", "passwordHash", "token_hash", "tokenHash"} & set(users["items"][0])
            _, user_detail = expect(port, "GET", "/api/admin/users/2", 200, cookie=admin)
            assert user_detail["user"]["listingCount"] == 0
            expect(port, "PATCH", "/api/admin/users/3/status", 409, {"status": "SUSPENDED"}, admin)
            expect(port, "PATCH", "/api/admin/users/2/status", 403, {"status": "SUSPENDED"}, owner)
            _, suspended = expect(port, "PATCH", "/api/admin/users/2/status", 200, {"status": "SUSPENDED"}, admin)
            assert suspended["user"]["accountStatus"] == "SUSPENDED"
            expect(port, "POST", "/api/auth/login", 401,
                   {"email": "stranger@example.test", "password": "test-password-123"})
            _, me = expect(port, "GET", "/api/auth/me", 200, cookie=stranger)
            assert me["user"] is None
            _, reactivated = expect(port, "PATCH", "/api/admin/users/2/status", 200, {"status": "ACTIVE"}, admin)
            assert reactivated["user"]["accountStatus"] == "ACTIVE"

            _, logs = expect(port, "GET", "/api/admin/audit-logs?page=1&limit=2", 200, cookie=admin)
            assert logs["total"] == 9 and len(logs["items"]) == 2 and logs["totalPages"] == 5
            actions = sql("SELECT string_agg(action, ',' ORDER BY action) FROM admin_audit_logs")
            for action in ("LISTING_APPROVED", "LISTING_REJECTED", "LISTING_ARCHIVED",
                           "USER_SUSPENDED", "USER_REACTIVATED", "DEALER_VERIFIED", "DEALER_UNVERIFIED",
                           "SALE_CONFIRMED", "SALE_REJECTED"):
                assert action in actions
            for route in ("/admin/cars", "/admin/cars/" + pending_id, "/admin/moderation", "/admin/users",
                          "/admin/users/2", "/admin/dealers", "/admin/dealers/1", "/admin/audit-logs", "/admin/settings"):
                expect(port, "GET", route, 200, cookie=admin)
            _, page = expect(port, "GET", "/admin/cars", 200, cookie=admin)
            assert b"<select" not in page
            admin_selects = Comboboxes()
            admin_selects.feed(page.decode("utf-8"))
            assert {"Listing status", "Country", "Sort listings"} <= set(admin_selects.controls)
            _, user_page = expect(port, "GET", "/admin/users", 200, cookie=admin)
            user_selects = Comboboxes()
            user_selects.feed(user_page.decode("utf-8"))
            assert {"Account status", "User role"} <= set(user_selects.controls)

            catalog_ids = []
            for values in (
                dict(listing, brandId="2", modelId="2", title='<img src=x onerror="window.__eurocars_xss=1">',
                     price=9000, year=2022, mileage=30000),
                dict(listing, title="BMW catalog test", price=20000, year=2018, mileage=10000),
            ):
                _, result = expect(port, "POST", "/api/cars", 201, {"listing": values, "status": "DRAFT"}, owner,
                                   {"Idempotency-Key": str(uuid.uuid4())})
                catalog_ids.append(result["listing"]["id"])
            sql(f"UPDATE cars SET status='ACTIVE' WHERE id IN ({','.join(str(int(car_id)) for car_id in catalog_ids)})")
            for sort, key, reverse in (("price-asc", "price", False), ("price-desc", "price", True),
                                       ("year-desc", "year", True), ("mileage-asc", "mileage", False)):
                _, result = expect(port, "GET", f"/api/cars?sort={sort}", 200)
                actual = [item[key] for item in result["items"]]
                assert len(actual) == 3 and actual == sorted(actual, reverse=reverse), (sort, actual)
            _, first_page = expect(port, "GET", "/api/cars?sort=price-asc&page=1&limit=2", 200)
            _, second_page = expect(port, "GET", "/api/cars?sort=price-asc&page=2&limit=2", 200)
            assert first_page["total"] == second_page["total"] == 3
            assert first_page["totalPages"] == second_page["totalPages"] == 2
            ids = [item["id"] for item in first_page["items"] + second_page["items"]]
            assert len(ids) == len(set(ids)) == 3

            for origin in ("", "https://attacker.example", f"http://localhost:{port}"):
                expect(port, "POST", "/api/auth/logout", 403, cookie=owner, extra_headers={"Origin": origin})
            _, still_signed_in = expect(port, "GET", "/api/auth/me", 200, cookie=owner)
            assert still_signed_in["user"]["id"] == owner_session["user"]["id"]
            status, _, malformed = request(port, "POST", "/api/auth/login", b"{")
            assert status == 400 and b"stack" not in malformed.lower()
            invalid_credentials = {"email": "stranger@example.test", "password": "wrong-password"}
            _, wrong_password = expect(port, "POST", "/api/auth/login", 401, invalid_credentials)
            _, unknown_user = expect(port, "POST", "/api/auth/login", 401,
                                     dict(invalid_credentials, email="missing@example.test"))
            assert wrong_password["statusMessage"] == unknown_user["statusMessage"]
            login_payload = {"email": "stranger@example.test", "password": "test-password-123"}
            first_headers, _ = expect(port, "POST", "/api/auth/login", 200, login_payload)
            second_headers, _ = expect(port, "POST", "/api/auth/login", 200, login_payload)
            first_session = first_headers["set-cookie"].split(";", 1)[0]
            second_session = second_headers["set-cookie"].split(";", 1)[0]
            expect(port, "POST", "/api/users/me/change-password", 401,
                   {"currentPassword": "wrong-password", "newPassword": "new-test-password"}, first_session)
            expect(port, "POST", "/api/users/me/change-password", 200,
                   {"currentPassword": "test-password-123", "newPassword": "new-test-password"}, first_session)
            _, session_after_change = expect(port, "GET", "/api/auth/me", 200, cookie=first_session)
            _, revoked_session = expect(port, "GET", "/api/auth/me", 200, cookie=second_session)
            assert session_after_change["user"]["id"] == "2" and revoked_session["user"] is None
            expect(port, "POST", "/api/auth/login", 401, login_payload)
            expect(port, "POST", "/api/auth/login", 200, dict(login_payload, password="new-test-password"))
            refresh_headers, _ = expect(port, "POST", "/api/auth/refresh", 200, cookie=first_session)
            refreshed_session = refresh_headers["set-cookie"].split(";", 1)[0]
            assert first_session != refreshed_session
            expect(port, "POST", "/api/auth/refresh", 401, cookie=first_session)
            _, old_session = expect(port, "GET", "/api/auth/me", 200, cookie=first_session)
            _, active_session = expect(port, "GET", "/api/auth/me", 200, cookie=refreshed_session)
            assert old_session["user"] is None and active_session["user"]["id"] == "2"
            expect(port, "POST", "/api/auth/logout", 200, cookie=refreshed_session)
            _, logged_out = expect(port, "GET", "/api/auth/me", 200, cookie=refreshed_session)
            assert logged_out["user"] is None

            def expect_constraint(query, code):
                result = subprocess.run(
                    [str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
                     "-d", "eurocars_test", "-c", f"BEGIN; {query}; ROLLBACK;"],
                    env=pg_env, capture_output=True,
                )
                assert result.returncode != 0 and code.encode() in result.stderr, (query, result.returncode, result.stderr)

            upload_id = str(uuid.uuid4())
            upload_path = f"temp/1/{upload_id}"
            sql(f"""INSERT INTO image_uploads(id,user_id,purpose,temporary_blob_pathname,expected_file_size,expected_mime_type,expires_at)
                    VALUES ('{upload_id}',1,'LISTING','{upload_path}',100,'image/png',now()+interval '1 hour')""")
            for query, code in (
                (f"UPDATE image_uploads SET status='INVALID' WHERE id='{upload_id}'", "23514"),
                (f"UPDATE image_uploads SET expected_file_size=10485761 WHERE id='{upload_id}'", "23514"),
                (f"UPDATE image_uploads SET purpose='AVATAR', expected_file_size=5242881 WHERE id='{upload_id}'", "23514"),
                (f"UPDATE image_uploads SET consumed_at=now() WHERE id='{upload_id}'", "23514"),
                (f"""INSERT INTO image_uploads(id,user_id,purpose,temporary_blob_pathname,expected_file_size,expected_mime_type,expires_at)
                      VALUES ('{uuid.uuid4()}',1,'LISTING','{upload_path}',100,'image/png',now()+interval '1 hour')""", "23505"),
            ):
                expect_constraint(query, code)

            existing_car = int(pending_id)
            for query, code in (
                (f"UPDATE cars SET price=-1 WHERE id={existing_car}", "23514"),
                (f"UPDATE cars SET mileage=-1 WHERE id={existing_car}", "23514"),
                (f"UPDATE cars SET status='INVALID' WHERE id={existing_car}", "23514"),
                (f"UPDATE cars SET model_id=2 WHERE id={existing_car}", "23503"),
                (f"UPDATE cars SET title=NULL WHERE id={existing_car}", "23502"),
                ("INSERT INTO favorites(user_id,car_id) SELECT user_id,car_id FROM favorites LIMIT 1", "23505"),
                ("INSERT INTO car_images(car_id,image_url) VALUES (9223372036854775807,'/missing')", "23503"),
                (f"INSERT INTO car_images(car_id,image_url,is_primary) VALUES ({int(car_id)},'/duplicate',true)", "23505"),
            ):
                expect_constraint(query, code)

            duplicate_payload = {"firstName": "Race", "lastName": "Test", "email": "race@example.test",
                                 "password": "test-password-123"}
            with ThreadPoolExecutor(max_workers=2) as executor:
                concurrent_results = list(executor.map(
                    lambda _: request(port, "POST", "/api/auth/register", duplicate_payload), range(2),
                ))
            assert sorted(result[0] for result in concurrent_results) == [200, 409]
            assert sql("SELECT COUNT(*) FROM users WHERE email='race@example.test'") == "1"
            sql("DELETE FROM auth_rate_limits")
            openssl = os.environ.get("OPENSSL_BIN") or shutil.which("openssl")
            if not openssl and shutil.which("git"):
                git_dir = Path(shutil.which("git")).resolve().parent.parent
                candidate = git_dir / "usr" / "bin" / "openssl.exe"
                if candidate.is_file():
                    openssl = str(candidate)
            if not openssl:
                raise RuntimeError("OpenSSL is required for browser tests; set OPENSSL_BIN to its executable.")
            cert, key = work / "test-cert.pem", work / "test-key.pem"
            subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                            "-subj", "/CN=localhost", "-keyout", str(key), "-out", str(cert)],
                           env=dict(os.environ, MSYS_NO_PATHCONV="1"), check=True, capture_output=True, timeout=30)
            browser_port = unused_port()
            browser_server = subprocess.Popen(
                ["node", str(ROOT / "tests" / "helpers" / "https-proxy.mjs"),
                 str(browser_port), str(port), str(key), str(cert)],
                cwd=ROOT, stdout=None, stderr=None,
            )
            for _ in range(100):
                if browser_server.poll() is not None:
                    raise RuntimeError("The browser test server stopped before becoming ready.")
                try:
                    with socket.create_connection(("127.0.0.1", browser_port), timeout=1):
                        break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("The browser test server did not start.")
            browser_env = dict(os.environ, E2E_BASE_URL=f"https://127.0.0.1:{browser_port}", E2E_ALLOW_MUTATIONS="1")
            report_dir = os.environ.get("LIGHTHOUSE_REPORT_DIR")
            if report_dir:
                report_path = Path(report_dir).resolve()
                report_path.mkdir(parents=True, exist_ok=True)
                chrome = subprocess.run(
                    ["node", "-e", "console.log(require('playwright').chromium.executablePath())"],
                    cwd=ROOT, check=True, capture_output=True, text=True,
                ).stdout.strip()
                lighthouse_env = dict(os.environ, CHROME_PATH=chrome)
                for name, path in (("home", "/"), ("catalog", "/cars")):
                    output = report_path / f"{name}.json"
                    if output.exists():
                        raise RuntimeError(f"Refusing to overwrite an existing Lighthouse report: {output}")
                    subprocess.run(
                        ["node", str(ROOT / "node_modules" / "lighthouse" / "cli" / "index.js"),
                         f"https://127.0.0.1:{browser_port}{path}", "--output=json",
                         f"--output-path={output}", "--only-categories=performance,accessibility,seo,best-practices",
                         "--chrome-flags=--headless --ignore-certificate-errors", "--quiet"],
                        cwd=ROOT, env=lighthouse_env, check=True, timeout=180,
                    )
            catalog_browser_args = ["--browser=chromium", "--grep=seller creates a draft"] \
                if os.environ.get("E2E_IMAGE_ONLY") == "1" else ["--browser=all"]
            subprocess.run(["node", str(ROOT / "node_modules" / "@playwright" / "test" / "cli.js"),
                            "test", "tests/e2e/catalog.spec.mjs", *catalog_browser_args, "--reporter=line", "--workers=1"],
                           cwd=ROOT, env=browser_env, check=True, timeout=600)
            load_report = os.environ.get("LOAD_REPORT_PATH")
            if load_report:
                report = []
                for users in (10, 25, 50):
                    start_barrier = threading.Barrier(users)

                    def load_worker():
                        start_barrier.wait(timeout=30)
                        samples = []
                        for _ in range(3):
                            started_at = time.perf_counter()
                            try:
                                status, _, _ = request(port, "GET", "/api/cars?limit=12")
                            except (OSError, http.client.HTTPException):
                                status = 0
                            samples.append(((time.perf_counter() - started_at) * 1000, status))
                        return samples

                    started_at = time.perf_counter()
                    with ThreadPoolExecutor(max_workers=users) as executor:
                        batches = list(executor.map(lambda _: load_worker(), range(users)))
                    duration = time.perf_counter() - started_at
                    samples = [sample for batch in batches for sample in batch]
                    latencies = sorted(sample[0] for sample in samples)
                    errors = sum(status != 200 for _, status in samples)
                    report.append({
                        "virtualUsers": users, "requests": len(samples), "errors": errors,
                        "durationSeconds": duration, "requestsPerSecond": len(samples) / duration,
                        "averageMs": statistics.mean(latencies),
                        "p95Ms": latencies[math.ceil(len(latencies) * 0.95) - 1],
                        "p99Ms": latencies[math.ceil(len(latencies) * 0.99) - 1],
                    })
                with Path(load_report).open("x", encoding="utf-8") as output:
                    json.dump(report, output, indent=2)
                assert all(item["errors"] == 0 for item in report), report
            blob_port = unused_port()
            blob_server = subprocess.Popen(
                ["node", str(ROOT / ".output" / "server" / "index.mjs")], cwd=ROOT,
                env=dict(app_env, NITRO_PORT=str(blob_port), BLOB_LISTING_ENABLED="true", BLOB_AVATAR_ENABLED="true",
                         BLOB_READ_WRITE_TOKEN="vercel_blob_rw_test_fake"),
                stdout=None, stderr=None,
            )
            try:
                for _ in range(100):
                    if blob_server.poll() is not None:
                        raise RuntimeError("The Blob test server stopped before becoming ready.")
                    try:
                        with socket.create_connection(("127.0.0.1", blob_port), timeout=1):
                            break
                    except OSError:
                        time.sleep(0.1)
                else:
                    raise RuntimeError("The Blob test server did not start.")
                blob_headers, blob_user = expect(blob_port, "POST", "/api/auth/register", 200,
                                                 {"firstName": "Blob", "lastName": "Owner", "email": "blob-owner@example.test",
                                                  "password": "test-password-123"})
                blob_owner = blob_headers["set-cookie"].split(";", 1)[0]
                stranger_headers, _ = expect(blob_port, "POST", "/api/auth/register", 200,
                                             {"firstName": "Blob", "lastName": "Stranger", "email": "blob-stranger@example.test",
                                              "password": "test-password-123"})
                blob_stranger = stranger_headers["set-cookie"].split(";", 1)[0]
                blob_user_id = blob_user["user"]["id"]
                _, prepared = expect(blob_port, "POST", "/api/uploads/prepare", 200,
                                     {"purpose": "LISTING", "size": 1024, "contentType": "image/png"}, blob_owner)
                uid = prepared["id"]
                sql(f"""UPDATE image_uploads SET status='READY', completed_at=NOW() WHERE id='{uid}';
                        INSERT INTO image_upload_variants(upload_id, variant, pathname, width, height, file_size, mime_type)
                        SELECT '{uid}', name, 'temp/{blob_user_id}/{uid}/fake/' || name || '.webp', 80, 40, 100, 'image/webp'
                        FROM unnest(ARRAY['thumbnail','catalog','gallery']) AS name;""")
                prepared_payload = {"listing": dict(listing, title="Blob test listing"), "status": "DRAFT",
                                    "imageOrder": [{"kind": "prepared", "id": uid, "isPrimary": True}]}
                expect(blob_port, "POST", "/api/cars", 409, prepared_payload, blob_stranger, {"Idempotency-Key": str(uuid.uuid4())})
                idem = str(uuid.uuid4())
                _, prepared_car = expect(blob_port, "POST", "/api/cars", 201, prepared_payload, blob_owner, {"Idempotency-Key": idem})
                blob_car = prepared_car["listing"]["id"]
                blob_image = prepared_car["listing"]["images"][0]["id"]
                expect(blob_port, "POST", "/api/cars", 200, prepared_payload, blob_owner, {"Idempotency-Key": idem})
                expect(blob_port, "POST", "/api/cars", 409, prepared_payload, blob_owner, {"Idempotency-Key": str(uuid.uuid4())})
                expect(blob_port, "GET", f"/api/cars/{blob_car}/images/{blob_image}", 404, cookie=blob_stranger)
                assert sql(f"SELECT COUNT(*) FROM image_sync_jobs WHERE image_id={blob_image}") == "1"
                public_key = str(uuid.uuid4())
                sql(f"""UPDATE cars SET status='ACTIVE' WHERE id={blob_car};
                        UPDATE car_images SET public_key='{public_key}',
                          image_url='https://test.public.blob.vercel-storage.com/cars/{blob_car}/{public_key}/catalog.webp',
                          thumbnail_url='https://test.public.blob.vercel-storage.com/cars/{blob_car}/{public_key}/thumbnail.webp',
                          catalog_url='https://test.public.blob.vercel-storage.com/cars/{blob_car}/{public_key}/catalog.webp',
                          gallery_url='https://test.public.blob.vercel-storage.com/cars/{blob_car}/{public_key}/gallery.webp'
                        WHERE id={blob_image};""")
                _, public_blob = expect(blob_port, "GET", f"/api/cars/{blob_car}", 200)
                assert public_blob["car"]["imageThumbnail"].endswith("/thumbnail.webp")
                assert public_blob["car"]["images"][0]["catalogUrl"].endswith("/catalog.webp")
                assert public_blob["car"]["images"][0]["url"].endswith("/gallery.webp")
                expect(blob_port, "PATCH", f"/api/cars/{blob_car}", 200, {"status": "ARCHIVED"}, blob_owner)
                assert sql(f"SELECT image_url FROM car_images WHERE id={blob_image}") == f"/api/cars/{blob_car}/images/{blob_image}"
                assert sql(f"SELECT COUNT(*) FROM image_delete_jobs WHERE store='PUBLIC' AND pathname LIKE 'cars/{blob_car}/{public_key}/%'") == "3"
                expect(blob_port, "PATCH", f"/api/cars/{blob_car}", 200, {"status": "DRAFT", "imageOrder": []}, blob_owner)
                assert sql(f"SELECT COUNT(*) FROM image_upload_variants WHERE upload_id='{uid}'") == "0"
                sql(f"""UPDATE cars SET status='ACTIVE' WHERE id={blob_car};
                        INSERT INTO car_images (car_id,image_url,position,is_primary,storage_provider,upload_id,public_key,
                                                thumbnail_url,catalog_url,gallery_url)
                        VALUES ({blob_car},'https://test.public.blob.vercel-storage.com/cars/{blob_car}/{public_key}/catalog.webp',
                                0,true,'BLOB','{uid}','{public_key}',
                                'https://test.public.blob.vercel-storage.com/cars/{blob_car}/{public_key}/thumbnail.webp',
                                'https://test.public.blob.vercel-storage.com/cars/{blob_car}/{public_key}/catalog.webp',
                                'https://test.public.blob.vercel-storage.com/cars/{blob_car}/{public_key}/gallery.webp');
                        INSERT INTO car_images (car_id,image_url,position,is_primary)
                        VALUES ({blob_car},'/images/no-test.png',1,false);""")
                blob_browser_port = unused_port()
                blob_browser_server = subprocess.Popen(
                    ["node", str(ROOT / "tests" / "helpers" / "https-proxy.mjs"),
                     str(blob_browser_port), str(blob_port), str(key), str(cert)],
                    cwd=ROOT, stdout=None, stderr=None,
                )
                try:
                    for _ in range(100):
                        if blob_browser_server.poll() is not None:
                            raise RuntimeError("The Blob browser proxy stopped before becoming ready.")
                        try:
                            with socket.create_connection(("127.0.0.1", blob_browser_port), timeout=1):
                                break
                        except OSError:
                            time.sleep(0.1)
                    else:
                        raise RuntimeError("The Blob browser proxy did not start.")
                    blob_browser_env = dict(os.environ, E2E_BASE_URL=f"https://127.0.0.1:{blob_browser_port}",
                                            E2E_BLOB_UI="1", E2E_BLOB_CAR_ID=blob_car)
                    subprocess.run(["node", str(ROOT / "node_modules" / "@playwright" / "test" / "cli.js"),
                                    "test", "tests/e2e/blob-ui.spec.mjs", "--browser=chromium", "--reporter=line", "--workers=1"],
                                   cwd=ROOT, env=blob_browser_env, check=True, timeout=180)
                finally:
                    blob_browser_server.terminate()
                    blob_browser_server.wait(timeout=10)
            finally:
                blob_server.terminate()
                blob_server.wait(timeout=10)
            sql("DELETE FROM auth_rate_limits")
            for _ in range(20):
                expect(port, "POST", "/api/auth/login", 400, {"email": "bad", "password": ""})
            expect(port, "POST", "/api/auth/login", 429, {"email": "bad", "password": ""})
            subprocess.run([str(PG_BIN / "pg_ctl"), "-D", str(data), "-m", "fast", "-w", "stop"],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
            started = False
            status, _, unavailable = request(port, "GET", "/api/health")
            assert status == 503 and password.encode() not in unavailable and b"stack" not in unavailable.lower()
            print("Passed: listing workflow, catalog filters and sorting, admin role guards, moderation, notifications, pagination and SSR.")
        finally:
            if browser_server is not None:
                browser_server.terminate()
                browser_server.wait(timeout=10)
            if server is not None:
                server.terminate()
                server.wait(timeout=10)
            if started:
                subprocess.run([str(PG_BIN / "pg_ctl"), "-D", str(data), "-m", "fast", "-w", "stop"],
                               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)


if __name__ == "__main__":
    if not shutil.which("node"):
        raise RuntimeError("Node.js is required.")
    run()
