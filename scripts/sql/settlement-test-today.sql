-- Settlement test records for TODAY (Asia/Phnom_Penh) — UAT database (jalat_db_uat) only.
--
-- Creates, for driver John Doe (+85515831198):
--   * 1 settlement  TEST-TODAY  (PENDING, PayWay $5.00 + transfer $18.50 = $23.50)
--   * 6 parcels delivered today (4 delivered = $23.50 + 4,000៛ COD, 1 failed, 1 to return)
--   * 1 activity row (settlement created)
--
-- Safe to re-run: it first deletes the previous TEST-TODAY seed. Every row is tagged
-- TEST-SEED-TODAY; see the CLEANUP block at the bottom to remove them.
-- Change driver_id / driver_name / driver_phone below to seed another driver.

BEGIN;

-- ---- remove a previous run --------------------------------------------------
DELETE FROM "ParcelDailyHistories"         WHERE "createdBy" = 'TEST-SEED-TODAY';
DELETE FROM "DriverCodSettlementHistories" WHERE "actionById" = 'TEST-SEED-TODAY';
DELETE FROM "DriverCodSettlements"         WHERE "createdById" = 'TEST-SEED-TODAY';

-- ---- settlement + its "created" activity row --------------------------------
WITH cfg AS (
  SELECT '0ff39656-d978-443a-a040-262efeb10157'::varchar AS driver_id,
         'John Doe'::varchar                             AS driver_name,
         '+85515831198'::varchar                         AS driver_phone,
         (now() AT TIME ZONE 'Asia/Phnom_Penh')::date     AS day
),
settlement AS (
  INSERT INTO "DriverCodSettlements"
    ("refNo", "driverId", "driverName", "driverPhoneNumber", "startAt", "endAt",
     "requestedAmount", "settledAmount", status,
     "createdById", "createdByName", "reviewedById", "reviewedByName")
  SELECT 'TEST-TODAY', driver_id, driver_name, driver_phone, day, day,
         5.00, 18.50, 'PENDING'::"DriverCodSettlements_status_enum",
         'TEST-SEED-TODAY', 'TEST Operation', 'TEST-SEED-TODAY', 'TEST Operation'
    FROM cfg
  RETURNING id, "requestedAmount", "settledAmount"
)
INSERT INTO "DriverCodSettlementHistories"
  ("driverCodSettlementId", status, "requestedAmount", "settledAmount", "actionById", "actionByName")
SELECT id, 'PENDING'::"DriverCodSettlementHistories_status_enum", "requestedAmount", "settledAmount",
       'TEST-SEED-TODAY', 'TEST Operation'
  FROM settlement;

-- ---- today's parcels ----------------------------------------------------------
WITH cfg AS (
  SELECT '0ff39656-d978-443a-a040-262efeb10157'::varchar AS driver_id,
         (now() AT TIME ZONE 'Asia/Phnom_Penh')::date     AS day
)
INSERT INTO "ParcelDailyHistories"
  ("parcelId", "orderId", "parcelUID", "driverId", "location", "recipientNumber",
   price, "codUsd", "codRiel", "totalCOD", fee, status, reason, noted,
   "deliveredAt", "createdAt", "updatedAt", "createdBy", "updatedBy")
SELECT 'TEST-P-TODAY-' || to_char(cfg.day, 'YYYYMMDD') || '-' || v.n,
       'TEST-O-TODAY-' || to_char(cfg.day, 'YYYYMMDD'),
       'TD' || to_char(cfg.day, 'MMDD') || '-' || v.n,          -- e.g. TD0924-01 (varchar 20)
       cfg.driver_id, v.location, v.phone,
       v.cod_usd, v.cod_usd, v.cod_riel, round((v.cod_usd + v.cod_riel / 4100.0)::numeric, 2),
       1.50,
       v.status::"ParcelDailyHistories_status_enum",
       v.reason, 'TEST record',
       (cfg.day + v.at) AT TIME ZONE 'Asia/Phnom_Penh',        -- Phnom Penh wall-clock time today
       (cfg.day + v.at) AT TIME ZONE 'Asia/Phnom_Penh',
       (cfg.day + v.at) AT TIME ZONE 'Asia/Phnom_Penh',
       'TEST-SEED-TODAY', 'TEST-SEED-TODAY'
  FROM cfg,
  (VALUES
    ('01', 'SUCCESS',   6.00,    0, '',                  time '08:10', 'Toul Kork, Phnom Penh', '+855 12 240 101'),
    ('02', 'SUCCESS',   8.50,    0, '',                  time '08:45', 'BKK1, Chamkarmon',      '+855 12 240 102'),
    ('03', 'SUCCESS',   4.25, 4000, '',                  time '09:20', 'Sen Sok, Phnom Penh',   '+855 12 240 103'),
    ('04', 'FAILED',    0.00,    0, 'Recipient not answering', time '09:55', 'Russey Keo',       '+855 12 240 104'),
    ('05', 'SUCCESS',   4.75,    0, '',                  time '10:30', 'Daun Penh',             '+855 12 240 105'),
    ('06', 'BE_RETURN', 0.00,    0, 'Recipient refused', time '11:05', 'Chbar Ampov',           '+855 12 240 106')
  ) AS v(n, status, cod_usd, cod_riel, reason, at, location, phone);

-- ---- check what was created ----------------------------------------------------
SELECT "refNo", "startAt", "endAt", status, "requestedAmount", "settledAmount"
  FROM "DriverCodSettlements" WHERE "createdById" = 'TEST-SEED-TODAY';
SELECT "parcelUID", status, "codUsd", "codRiel", reason, "deliveredAt"
  FROM "ParcelDailyHistories" WHERE "createdBy" = 'TEST-SEED-TODAY' ORDER BY "deliveredAt";

COMMIT;

-- ---- CLEANUP (run separately to remove today's test records) --------------------
-- BEGIN;
-- DELETE FROM "ParcelDailyHistories"         WHERE "createdBy" = 'TEST-SEED-TODAY';
-- DELETE FROM "DriverCodSettlementHistories" WHERE "actionById" = 'TEST-SEED-TODAY';
-- DELETE FROM "DriverCodSettlements"         WHERE "createdById" = 'TEST-SEED-TODAY';
-- COMMIT;
