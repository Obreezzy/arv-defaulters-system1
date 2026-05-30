CREATE TABLE users (
    user_id        SERIAL        PRIMARY KEY,
    username       VARCHAR(50)   UNIQUE NOT NULL,
    email          VARCHAR(100)  UNIQUE NOT NULL,
    password_hash  VARCHAR(255)  NOT NULL,
    full_name      VARCHAR(100),
    role           VARCHAR(20)   DEFAULT 'healthcare_worker',
    phone_number   VARCHAR(20),
    is_active      BOOLEAN       DEFAULT true,
    staff_id       VARCHAR(20)   UNIQUE,
    nurse_number   VARCHAR(20)   UNIQUE,
    clinic_name    VARCHAR(100),
    clinic_number  VARCHAR(20),
    facility_id    VARCHAR(20)   REFERENCES facilities(facility_id),
    created_at     TIMESTAMPTZ   DEFAULT NOW()
);