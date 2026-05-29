"""
seed_database.py
----------------
Seeds your Neon Postgres database from the 4 CSV files.
Run once after applying schema.sql.

Usage:
    pip install pandas psycopg2-binary python-dotenv
    python seed_database.py

Place this file in:  arv-defaulters-system1/backend/
The CSVs are expected in the same folder or set CSV_DIR below.
"""

import os
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────
DATABASE_URL = os.environ["DATABASE_URL"]   # from .env
CSV_DIR      = os.path.join(os.path.dirname(__file__), "ml_api", "arv_inference", "data")
# If your CSVs are somewhere else, change CSV_DIR ↑

def none(val):
    """Convert NaN / NaT to None for Postgres."""
    if pd.isna(val):
        return None
    return val

def connect():
    return psycopg2.connect(DATABASE_URL)

# ── 1. Facilities ─────────────────────────────────────────────────
def seed_facilities(conn):
    df = pd.read_csv(os.path.join(CSV_DIR, "facilities.csv"))
    rows = [
        (
            row.facility_id, row.facility_name, none(row.facility_type),
            none(row.province), none(row.district),
            none(row.gps_lat), none(row.gps_lon), none(row.catchment_type)
        )
        for _, row in df.iterrows()
    ]
    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO facilities
              (facility_id, facility_name, facility_type, province, district,
               gps_lat, gps_lon, catchment_type)
            VALUES %s
            ON CONFLICT (facility_id) DO NOTHING
        """, rows)
    conn.commit()
    print(f"  facilities : {len(rows)} rows")

# ── 2. Patients ───────────────────────────────────────────────────
def seed_patients(conn):
    df = pd.read_csv(os.path.join(CSV_DIR, "patients.csv"))
    rows = [
        (
            row.patient_id, row.facility_id, none(row.sex),
            none(row.date_of_birth), none(row.art_start_date),
            none(row.hiv_diagnosis_date), none(row.who_stage_at_enrolment),
            none(row.baseline_cd4), none(row.residence_province),
            none(row.residence_district), none(row.residence_village),
            none(row.residence_ward), none(row.residence_gps_lat),
            none(row.residence_gps_lon), none(row.self_reported_travel_time_min),
            none(row.phone_available), none(row.marital_status),
            none(row.education_level), none(row.occupation),
            none(row.disclosure_status), none(row.exit_status),
            none(row.exit_date)
        )
        for _, row in df.iterrows()
    ]
    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO patients
              (patient_id, facility_id, sex, date_of_birth, art_start_date,
               hiv_diagnosis_date, who_stage_at_enrolment, baseline_cd4,
               residence_province, residence_district, residence_village,
               residence_ward, residence_gps_lat, residence_gps_lon,
               self_reported_travel_time_min, phone_available, marital_status,
               education_level, occupation, disclosure_status,
               exit_status, exit_date)
            VALUES %s
            ON CONFLICT (patient_id) DO NOTHING
        """, rows, page_size=500)
    conn.commit()
    print(f"  patients   : {len(rows)} rows")

# ── 3. Visits ─────────────────────────────────────────────────────
def seed_visits(conn):
    df = pd.read_csv(os.path.join(CSV_DIR, "visits.csv"))
    CHUNK = 2000
    total = 0
    with conn.cursor() as cur:
        for start in range(0, len(df), CHUNK):
            chunk = df.iloc[start:start + CHUNK]
            rows = [
                (
                    row.visit_id, row.patient_id, row.visit_date,
                    none(row.days_dispensed), none(row.scheduled_next_appt_date),
                    none(row.regimen), none(row.dsd_model),
                    none(row.viral_load_result), none(row.viral_load_date),
                    none(row.weight_kg), none(row.height_cm),
                    none(row.tb_screen_result), none(row.pregnancy_status),
                    none(row.functional_status)
                )
                for _, row in chunk.iterrows()
            ]
            execute_values(cur, """
                INSERT INTO visits
                  (visit_id, patient_id, visit_date, days_dispensed,
                   scheduled_next_appt_date, regimen, dsd_model,
                   viral_load_result, viral_load_date, weight_kg, height_cm,
                   tb_screen_result, pregnancy_status, functional_status)
                VALUES %s
                ON CONFLICT (visit_id) DO NOTHING
            """, rows)
            total += len(rows)
            print(f"  visits     : {total}/{len(df)} inserted...", end="\r")
    conn.commit()
    print(f"  visits     : {total} rows total          ")

# ── 4. Facility Stockouts ─────────────────────────────────────────
def seed_stockouts(conn):
    df = pd.read_csv(os.path.join(CSV_DIR, "facility_stockouts.csv"))
    rows = [
        (row.facility_id, row.year_month, int(row.stockout_flag))
        for _, row in df.iterrows()
    ]
    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO facility_stockouts (facility_id, year_month, stockout_flag)
            VALUES %s
            ON CONFLICT (facility_id, year_month) DO NOTHING
        """, rows, page_size=500)
    conn.commit()
    print(f"  stockouts  : {len(rows)} rows")

# ── Main ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\nConnecting to Neon...")
    conn = connect()
    print("Connected.\n")

    print("Seeding tables...")
    seed_facilities(conn)
    seed_patients(conn)
    seed_visits(conn)
    seed_stockouts(conn)

    conn.close()
    print("\nDone! All 4 tables seeded successfully.")
