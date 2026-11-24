"""Verify the vehicle insert against a disposable PostgreSQL schema, without running the seeder."""

import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
PG_BIN = Path(os.environ["PG_BIN"])


def run():
    source = (ROOT / "scripts" / "seed" / "vehicles.ts").read_text(encoding="utf-8")
    match = re.search(
        r"`(INSERT INTO cars\(seller_id,dealer_id,brand_id,model_id,title,trim,description,price,currency,year,mileage,"
        r"[\s\S]*?RETURNING id::text)`",
        source,
    )
    if not match:
        raise RuntimeError("Demo vehicle insert not found.")

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="eurocars-demo-sql-test-") as directory:
        work = Path(directory)
        data = work / "database"
        password = secrets.token_hex(24)
        password_file = work / "password"
        password_file.write_text(password, encoding="utf-8")
        subprocess.run(
            [str(PG_BIN / "initdb"), "-D", str(data), "-U", "test_user",
             "-A", "scram-sha-256", "--pwfile", str(password_file), "--no-instructions"],
            check=True, capture_output=True,
        )
        password_file.unlink()
        started = False
        try:
            subprocess.run(
                [str(PG_BIN / "pg_ctl"), "-D", str(data), "-l", str(work / "postgres.log"),
                 "-o", f"-p {port} -h 127.0.0.1", "-w", "start"],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30,
            )
            started = True
            env = dict(os.environ, PGHOST="127.0.0.1", PGPORT=str(port), PGUSER="test_user",
                       PGPASSWORD=password, PGSSLMODE="disable")
            subprocess.run([str(PG_BIN / "createdb"), "demo_sql_test"], env=env, check=True, capture_output=True)
            subprocess.run(
                [str(PG_BIN / "psql"), "-v", "ON_ERROR_STOP=1", "-d", "demo_sql_test",
                 "-f", str(ROOT / "server" / "db.sql")],
                env=env, check=True, capture_output=True,
            )
            setup = """
                INSERT INTO countries(code,name) VALUES ('DE','Germany');
                INSERT INTO users(email,password_hash,country_code,city) VALUES ('test@example.com','test','DE','Berlin');
                INSERT INTO car_brands(name,slug) VALUES ('Test','test');
                INSERT INTO car_models(brand_id,name,slug) VALUES (1,'Test','test');
            """
            values = "1,NULL,1,1,'Demo','Test','Test',100,'EUR',2022,100,'PETROL','AUTOMATIC','SEDAN','USED',2000,150,4,5,'Black','Black'"
            executions = "\n".join(
                f"EXECUTE demo_insert({values},'{status}');"
                for status in ("ACTIVE", "PENDING", "ARCHIVED", "SOLD")
            )
            query = setup + "\nPREPARE demo_insert AS " + match.group(1) + ";\n" + executions + """
                SELECT string_agg(status || ':' || (published_at IS NOT NULL)::text || ':' || sale_confirmation_status,
                                  '|' ORDER BY id) FROM cars;
            """
            result = subprocess.run(
                [str(PG_BIN / "psql"), "-q", "-v", "ON_ERROR_STOP=1", "-d", "demo_sql_test", "-tAc", query],
                env=env, check=True, capture_output=True, text=True,
            )
            assert result.stdout.strip().splitlines()[-1] == (
                "ACTIVE:true:NOT_REQUESTED|PENDING:false:NOT_REQUESTED|"
                "ARCHIVED:false:NOT_REQUESTED|SOLD:false:CONFIRMED"
            )
            print("Passed: demo vehicle insert and all four listing statuses.")
        finally:
            if started:
                subprocess.run(
                    [str(PG_BIN / "pg_ctl"), "-D", str(data), "-m", "fast", "-w", "stop"],
                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30,
                )


if __name__ == "__main__":
    run()
