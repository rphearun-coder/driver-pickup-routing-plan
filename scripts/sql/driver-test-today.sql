-- Pickups / Deliveries / Returns test records for TODAY (Asia/Phnom_Penh) — UAT (jalat_db_uat) only.
--
-- For driver John Doe (+85515831198) it creates:
--   Pickups tab       3 stops to pick up (2 In progress, 1 On route)
--   Pickup History    2 picked up + 1 aborted, today
--   Deliveries tab    5 parcels On delivery (route sequence 1–5, mixed COD)
--   Delivery History  2 delivered + 1 failed, today
--   Returns tab       To shop: 3 (one waiting 4 days → overdue flag); To warehouse: 2
--   Returned tab      1 returned to the shop today
--
-- Shop / address / zone / photo fields are copied from John Doe's existing orders and
-- parcels, so cards show real partner info. Every row has createdBy = 'TEST-SEED-TODAY'
-- and ids derived from the date, so re-running replaces the previous run. The CLEANUP
-- block at the bottom removes them. Change driver_id (and the partner ids) to seed another driver.

BEGIN;

-- ---- remove a previous run --------------------------------------------------
DELETE FROM "Parcels" WHERE "createdBy" = 'TEST-SEED-TODAY';
DELETE FROM "Orders"  WHERE "createdBy" = 'TEST-SEED-TODAY';

-- ---- orders (pickups) ----------------------------------------------------------
-- Partner A = 319c187a… (Phearun Shoppe), partner B = f9364538…
WITH cfg AS (
  SELECT '0ff39656-d978-443a-a040-262efeb10157'::varchar AS driver_id,
         (now() AT TIME ZONE 'Asia/Phnom_Penh')::date     AS day
)
INSERT INTO "Orders"
  (id, "userId", "driverId", "driverName", status, "onRoute", "estimatedTotalParcel", "totalParcel",
   "totalPrice", "totalCOD", prefix, "isRegistered", reason, noted, "pickupAt", "requestedAt",
   "createdAt", "updatedAt", "createdBy",
   "pickupTime", "partnerName", "partnerType", "requestSourceType", "pickupAddress",
   "pickupLatitude", "pickupLongitude", "zoneId", "zoneName", "partnerCategory")
SELECT md5('TEST-SEED-TODAY-order-' || v.n || '-' || cfg.day)::uuid,
       v.user_id, cfg.driver_id, 'John Doe',
       v.status::"Orders_status_enum", v.on_route, v.est, v.total, v.total * 1.5, 0,
       'TST', v.status = 'PICKED_UP', v.reason, 'TEST record',
       (cfg.day + v.at) AT TIME ZONE 'Asia/Phnom_Penh',
       (cfg.day + time '07:30') AT TIME ZONE 'Asia/Phnom_Penh',
       (cfg.day + time '07:30') AT TIME ZONE 'Asia/Phnom_Penh',
       (cfg.day + v.at) AT TIME ZONE 'Asia/Phnom_Penh',
       'TEST-SEED-TODAY',
       t."pickupTime", t."partnerName", t."partnerType", t."requestSourceType", t."pickupAddress",
       t."pickupLatitude", t."pickupLongitude", t."zoneId", t."zoneName", t."partnerCategory"
  FROM cfg,
  (VALUES
    ('O1', '319c187a-531b-4468-851f-51828a5c125f', 'IN_PROGRESS',   false, 3, 0, NULL,                 time '07:30'),
    ('O2', 'f9364538-cb25-49bd-ac06-aebad667d7db', 'IN_PROGRESS',   false, 5, 0, NULL,                 time '07:30'),
    ('O3', '319c187a-531b-4468-851f-51828a5c125f', 'ON_ROUTE',      true,  2, 0, NULL,                 time '07:30'),
    ('O4', 'f9364538-cb25-49bd-ac06-aebad667d7db', 'PICKED_UP',     false, 4, 4, NULL,                 time '08:15'),
    ('O5', '319c187a-531b-4468-851f-51828a5c125f', 'ABORT_PICK_UP', false, 2, 0, 'Shop closed today', time '08:40'),
    ('O6', '319c187a-531b-4468-851f-51828a5c125f', 'PICKED_UP',     false, 3, 3, NULL,                 time '09:05')
  ) AS v(n, user_id, status, on_route, est, total, reason, at)
  -- copy shop / address / zone from that partner's latest real order
  CROSS JOIN LATERAL (
    SELECT * FROM "Orders" o
     WHERE o."userId" = v.user_id AND COALESCE(o."createdBy", '') <> 'TEST-SEED-TODAY'
     ORDER BY o."createdAt" DESC LIMIT 1
  ) t;

-- ---- parcels (deliveries, delivery history, returns) ---------------------------
WITH cfg AS (
  SELECT '0ff39656-d978-443a-a040-262efeb10157'::varchar AS driver_id,
         (now() AT TIME ZONE 'Asia/Phnom_Penh')::date     AS day
),
-- photo / zone / sender type copied from one of the driver's real parcels
tpl AS (
  SELECT "parcelImage", "zoneCommonPlaceId", "refSenderType"
    FROM "Parcels"
   WHERE "driverId" = (SELECT driver_id FROM cfg) AND COALESCE("parcelImage", '') <> ''
     AND COALESCE("createdBy", '') <> 'TEST-SEED-TODAY'
   ORDER BY "createdAt" DESC LIMIT 1
)
INSERT INTO "Parcels"
  (id, "orderId", "userId", "parcelUID", "driverId", "returnByDriverId", location, "recipientNumber",
   "recipientName", price, "codUsd", "codRiel", "totalCOD", fee, status, reason, noted,
   "parcelImage", "zoneCommonPlaceId", "refSenderType", "receiverBy", sequence,
   "proofOfReturnToSender", "proofOfFailed",
   "deliveredAt", "createdAt", "updatedAt", "createdBy", "updatedBy")
SELECT md5('TEST-SEED-TODAY-parcel-' || v.n || '-' || cfg.day)::uuid,
       md5('TEST-SEED-TODAY-order-' || v.order_n || '-' || cfg.day)::uuid::varchar,
       v.user_id,
       'TD' || to_char(cfg.day, 'MMDD') || '-' || v.n,            -- e.g. TD0924-D1
       cfg.driver_id,
       CASE WHEN v.status IN ('BE_RETURN', 'RETURNING_FROM_DRIVER', 'PROCESSING_RETURN', 'RETURN')
            THEN cfg.driver_id END,
       v.location, v.phone, v.recipient,
       1.00, v.cod_usd, v.cod_riel, round((v.cod_usd + v.cod_riel / 4100.0)::numeric, 2), 1.50,
       v.status::"Parcels_status_enum", v.reason, 'TEST record',
       tpl."parcelImage", tpl."zoneCommonPlaceId", tpl."refSenderType",
       v.receiver::"Parcels_receiverby_enum", v.seq,
       CASE WHEN v.status = 'RETURN' THEN tpl."parcelImage" ELSE '' END,
       CASE WHEN v.status = 'FAILED' THEN tpl."parcelImage" ELSE '' END,
       CASE WHEN v.done_at IS NULL THEN NULL ELSE (cfg.day + v.done_at) AT TIME ZONE 'Asia/Phnom_Penh' END,
       (cfg.day + time '09:10') AT TIME ZONE 'Asia/Phnom_Penh',
       -- Returns' "waiting N days" is based on updatedAt: R3 is made 4 days old (overdue flag)
       ((cfg.day + COALESCE(v.done_at, time '09:10')) AT TIME ZONE 'Asia/Phnom_Penh') - make_interval(days => v.age_days),
       'TEST-SEED-TODAY', 'TEST-SEED-TODAY'
  FROM cfg, tpl,
  (VALUES
    -- n    order  partner                                  status                   cod$   ៛      receiver  seq done_at        age reason                     location                 phone              recipient
    ('D1', 'O4', 'f9364538-cb25-49bd-ac06-aebad667d7db', 'ON_DELIVERY',            12.50,     0, NULL,     1, NULL::time,       0, '',                        'Toul Kork, Phnom Penh', '012 240 201', 'Sokha'),
    ('D2', 'O4', 'f9364538-cb25-49bd-ac06-aebad667d7db', 'ON_DELIVERY',             0.00, 20000, NULL,     2, NULL,             0, '',                        'BKK1, Chamkarmon',      '012 240 202', 'Dara'),
    ('D3', 'O4', 'f9364538-cb25-49bd-ac06-aebad667d7db', 'ON_DELIVERY',             7.25,     0, NULL,     3, NULL,             0, '',                        'Sen Sok, Phnom Penh',   '012 240 203', 'Vanna'),
    ('D4', 'O6', '319c187a-531b-4468-851f-51828a5c125f', 'ON_DELIVERY',             0.00,     0, NULL,     4, NULL,             0, '',                        'Russey Keo',            '012 240 204', 'Chanthy'),
    ('D5', 'O6', '319c187a-531b-4468-851f-51828a5c125f', 'ON_DELIVERY',            25.00,  8000, NULL,     5, NULL,             0, '',                        'Daun Penh',             '012 240 205', 'Rotha'),
    ('H1', 'O4', 'f9364538-cb25-49bd-ac06-aebad667d7db', 'SUCCESS',                 9.00,     0, 'DRIVER', 0, time '10:20',     0, '',                        'Chbar Ampov',           '012 240 206', 'Bopha'),
    ('H2', 'O6', '319c187a-531b-4468-851f-51828a5c125f', 'SUCCESS',                 4.50,  4000, 'DRIVER', 0, time '10:45',     0, '',                        'Toul Kork, Phnom Penh', '012 240 207', 'Kosal'),
    ('H3', 'O6', '319c187a-531b-4468-851f-51828a5c125f', 'FAILED',                  6.00,     0, NULL,     0, time '11:10',     0, 'Recipient not answering', 'Sen Sok, Phnom Penh',   '012 240 208', 'Nary'),
    ('R1', 'O6', '319c187a-531b-4468-851f-51828a5c125f', 'BE_RETURN',               0.00,     0, NULL,     0, time '08:30',     0, 'Recipient refused',       'BKK1, Chamkarmon',      '012 240 209', 'Pisey'),
    ('R2', 'O6', '319c187a-531b-4468-851f-51828a5c125f', 'BE_RETURN',               0.00,     0, NULL,     0, time '08:50',     0, 'Wrong item',              'Daun Penh',             '012 240 210', 'Sophal'),
    ('R3', 'O4', 'f9364538-cb25-49bd-ac06-aebad667d7db', 'BE_RETURN',               0.00,     0, NULL,     0, time '09:00',     4, 'Recipient cancelled',     'Russey Keo',            '012 240 211', 'Mealea'),
    ('W1', 'O4', 'f9364538-cb25-49bd-ac06-aebad667d7db', 'RETURNING_FROM_DRIVER',   0.00,     0, NULL,     0, time '09:20',     0, 'Address not found',       'Chbar Ampov',           '012 240 212', 'Theary'),
    ('W2', 'O6', '319c187a-531b-4468-851f-51828a5c125f', 'PROCESSING_RETURN',       0.00,     0, NULL,     0, time '09:40',     0, 'Damaged parcel',          'Toul Kork, Phnom Penh', '012 240 213', 'Rithy'),
    ('T1', 'O6', '319c187a-531b-4468-851f-51828a5c125f', 'RETURN',                  0.00,     0, NULL,     0, time '11:30',     0, 'Returned to shop',        'Sen Sok, Phnom Penh',   '012 240 214', 'Sreymom')
  ) AS v(n, order_n, user_id, status, cod_usd, cod_riel, receiver, seq, done_at, age_days, reason, location, phone, recipient);

-- ---- delivery coordinates (so Deliveries' Nearest sort and distances work) --------
-- Approximate centre of each test location's district in Phnom Penh. Without these the
-- column's default 0,0 means "no location" and the parcels keep server order, unranked.
UPDATE "Parcels" p
   SET "deliveryLatitude" = v.lat, "deliveryLongitude" = v.lng
  FROM (VALUES
    ('Toul Kork, Phnom Penh', 11.5745, 104.8970),
    ('BKK1, Chamkarmon',      11.5520, 104.9260),
    ('Sen Sok, Phnom Penh',   11.5950, 104.8830),
    ('Russey Keo',            11.6060, 104.9120),
    ('Daun Penh',             11.5700, 104.9230),
    ('Chbar Ampov',           11.5390, 104.9460)
  ) AS v(location, lat, lng)
 WHERE p."createdBy" = 'TEST-SEED-TODAY' AND p.location = v.location;

-- ---- check what was created ------------------------------------------------------
SELECT prefix, status, "onRoute", "estimatedTotalParcel", "partnerName", "pickupAt"
  FROM "Orders" WHERE "createdBy" = 'TEST-SEED-TODAY' ORDER BY "pickupAt";
SELECT "parcelUID", status, "codUsd", "codRiel", sequence, reason, "deliveredAt", "updatedAt"
  FROM "Parcels" WHERE "createdBy" = 'TEST-SEED-TODAY' ORDER BY "parcelUID";

COMMIT;

-- ---- CLEANUP (run separately to remove these test records) ----------------------
-- BEGIN;
-- DELETE FROM "Parcels" WHERE "createdBy" = 'TEST-SEED-TODAY';
-- DELETE FROM "Orders"  WHERE "createdBy" = 'TEST-SEED-TODAY';
-- COMMIT;
