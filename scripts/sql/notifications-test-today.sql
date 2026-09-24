-- Notifications test records for driver John Doe (+85515831198) — UAT (jalat_db_uat) only.
-- Read by Jalat-User-Service userNotifications → the app's /notifications page.
--
-- Creates 1 parent "Notifications" row (createdBy = 'TEST-SEED-TODAY') and 7 of John Doe's
-- "UserNotifications" linked to it, timed relative to now: 3 unread (last 2 hours) and
-- 4 read (earlier today → 5 days ago), including an HTML body and a Khmer one.
-- Safe to re-run: it first removes the previous run. CLEANUP block at the bottom.

BEGIN;

-- ---- remove a previous run --------------------------------------------------
DELETE FROM "UserNotifications"
 WHERE "notificationId" IN (SELECT id FROM "Notifications" WHERE "createdBy" = 'TEST-SEED-TODAY');
DELETE FROM "Notifications" WHERE "createdBy" = 'TEST-SEED-TODAY';

-- ---- parent notification + the driver's notifications ------------------------
WITH cfg AS (
  SELECT '0ff39656-d978-443a-a040-262efeb10157'::varchar AS user_id
),
parent AS (
  INSERT INTO "Notifications" (title, body, type, status, "userIds", "createdBy", "updatedBy")
  SELECT 'TEST notifications', 'Test records for the driver app Notifications page',
         'SPECIFIC_USER'::"Notifications_type_enum", 'SENT'::"Notifications_status_enum",
         cfg.user_id, 'TEST-SEED-TODAY', 'TEST-SEED-TODAY'
    FROM cfg
  RETURNING id
)
INSERT INTO "UserNotifications" ("userId", "notificationId", title, body, "isRead", status, "createdAt")
SELECT cfg.user_id, parent.id, v.title, v.body, v.is_read,
       'ACTIVE'::"UserNotifications_status_enum", now() - v.ago
  FROM cfg, parent,
  (VALUES
    ('Settlement ready: TEST-TODAY',
     'Operation queued a COD settlement of $23.50 for today. Transfer the money, then send the receipt.',
     false, interval '5 minutes'),
    ('New pickup assigned',
     'Phearun Shoppe · 3 parcels · #12345, Samdach Penn Nouth St. (289), Phnom Penh.',
     false, interval '40 minutes'),
    ('Return waiting 4 days: TD0924-R3',
     'This parcel has been waiting to go back to the shop for 4 days. Please return it today.',
     false, interval '1 hour 30 minutes'),
    ('Settlement approved: TEST-H2',
     'Your COD settlement of $20.25 was approved by TEST Operation.',
     true, interval '3 hours'),
    ('Settlement rejected: TEST-H3',
     'Transfer screenshot does not match the amount. Please send the receipt again.',
     true, interval '1 day 2 hours'),
    ('Holiday schedule',
     '<p>Pchum Ben: pickups pause <strong>Oct 1–3</strong>. Deliveries continue &amp; COD settles as usual.</p>',
     true, interval '2 days 4 hours'),
    ('សេចក្ដីជូនដំណឹង',
     '<p>សូមពិនិត្យការកំណត់ទីតាំង (GPS) មុនពេលចាប់ផ្តើមការងារ។</p>',
     true, interval '5 days')
  ) AS v(title, body, is_read, ago);

-- ---- check ---------------------------------------------------------------------
SELECT title, "isRead", "createdAt"
  FROM "UserNotifications"
 WHERE "notificationId" IN (SELECT id FROM "Notifications" WHERE "createdBy" = 'TEST-SEED-TODAY')
 ORDER BY "createdAt" DESC;

COMMIT;

-- ---- CLEANUP (run separately) ---------------------------------------------------
-- BEGIN;
-- DELETE FROM "UserNotifications"
--  WHERE "notificationId" IN (SELECT id FROM "Notifications" WHERE "createdBy" = 'TEST-SEED-TODAY');
-- DELETE FROM "Notifications" WHERE "createdBy" = 'TEST-SEED-TODAY';
-- COMMIT;
