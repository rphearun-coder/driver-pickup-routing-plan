// Seeds UAT test data for the Settlement History → details sheet (parcel list + activity).
//
//   node scripts/seed-settlement-test-data.cjs            insert (re-running replaces the previous seed)
//   node scripts/seed-settlement-test-data.cjs --clean    remove everything this script inserted
//
// Writes to the shared UAT database configured in ../Jalat-Order-Service/.env, for the
// driver "John Doe" (+85515831198) and his existing TEST-* settlements. Every inserted row
// is tagged TEST-SEED (ParcelDailyHistories.createdBy / parcelId prefix, and
// DriverCodSettlementHistories.actionById), so --clean touches nothing else.
const fs = require('fs');
const path = require('path');

const ORDER_SERVICE_DIR = path.resolve(__dirname, '../../Jalat-Order-Service');
const { Client } = require(path.join(ORDER_SERVICE_DIR, 'node_modules/pg'));

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ORDER_SERVICE_DIR, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);

const TAG = 'TEST-SEED';
const DRIVER_ID = '0ff39656-d978-443a-a040-262efeb10157'; // John Doe
const RIEL_PER_USD = 4100;

// Parcels per settlement day: [status, codUsd, codRiel, reason?]. Times are spread
// through the Phnom Penh working day. COD on delivered parcels adds up to the
// settlement's PayWay + transfer amounts where the settlement has them.
const PARCELS_BY_DAY = {
  '2026-09-23': [
    ['SUCCESS', 3.0, 0],
    ['SUCCESS', 6.75, 4000],
    ['FAILED', 0, 0, 'Recipient not answering'],
  ],
  '2026-09-22': [
    ['SUCCESS', 5.0, 0],
    ['SUCCESS', 7.5, 0],
    ['SUCCESS', 2.25, 4000],
    ['FAILED', 0, 0, 'Wrong address'],
  ],
  '2026-09-20': [
    ['SUCCESS', 8.0, 0],
    ['SUCCESS', 6.25, 0],
    ['SUCCESS', 6.0, 0],
    ['BE_RETURN', 0, 0, 'Recipient refused'],
  ],
  '2026-09-18': [
    ['SUCCESS', 3.5, 0],
    ['SUCCESS', 4.0, 8000],
    ['RETURN', 0, 0, 'Returned to sender'],
  ],
  // 7 parcels — exercises the sheet's "Show all" button (it previews 5).
  '2026-09-15': [
    ['SUCCESS', 10.0, 0],
    ['SUCCESS', 5.5, 0],
    ['SUCCESS', 2.0, 0],
    ['SUCCESS', 4.75, 12000],
    ['SUCCESS', 1.5, 0],
    ['FAILED', 0, 0, 'Phone switched off'],
    ['SUCCESS', 3.25, 0],
  ],
  '2026-09-12': [
    ['SUCCESS', 9.75, 0],
    ['SUCCESS', 4.25, 0],
    ['FAILED', 0, 0, 'Customer rescheduled'],
  ],
};

const LOCATIONS = ['Toul Kork, Phnom Penh', 'BKK1, Chamkarmon', 'Sen Sok, Phnom Penh', 'Russey Keo', 'Daun Penh', 'Chbar Ampov'];

function connect() {
  return new Client({
    host: env.DB_HOST,
    port: +env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_SCHEMA,
  });
}

async function clean(c) {
  const parcels = await c.query(`DELETE FROM "ParcelDailyHistories" WHERE "createdBy" = $1 AND "parcelId" LIKE 'TEST-P-%'`, [TAG]);
  const history = await c.query(`DELETE FROM "DriverCodSettlementHistories" WHERE "actionById" = $1`, [TAG]);
  return { parcels: parcels.rowCount, history: history.rowCount };
}

async function seed(c) {
  const { rows: settlements } = await c.query(
    `SELECT id, "refNo", "startAt"::text AS day, status, "requestedAmount", "settledAmount",
            "createdAt", "submittedAt", "approvedAt", "rejectedAt", "rejectReason"
       FROM "DriverCodSettlements"
      WHERE "driverId" = $1 AND "refNo" LIKE 'TEST-%'`,
    [DRIVER_ID],
  );
  if (!settlements.length) throw new Error('No TEST-* settlements found for John Doe — nothing to attach parcels to.');

  let parcelCount = 0;
  for (const [day, parcels] of Object.entries(PARCELS_BY_DAY)) {
    for (const [i, [status, codUsd, codRiel, reason]] of parcels.entries()) {
      const n = String(i + 1).padStart(2, '0');
      const deliveredAt = new Date(`${day}T${String(9 + i).padStart(2, '0')}:${(i * 13) % 60 === 0 ? '05' : String((i * 13) % 60).padStart(2, '0')}:00+07:00`);
      await c.query(
        `INSERT INTO "ParcelDailyHistories"
           ("parcelId", "orderId", "parcelUID", "driverId", "location", "recipientNumber",
            price, "codUsd", "codRiel", "totalCOD", fee, status, reason, noted,
            "deliveredAt", "createdAt", "updatedAt", "createdBy", "updatedBy")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $15, $16, $16)`,
        [
          `TEST-P-${day}-${n}`,
          `TEST-O-${day}`,
          `T${day.slice(5).replace('-', '')}-${n}`, // e.g. T0922-01 (column is varchar(20))
          DRIVER_ID,
          LOCATIONS[(i + day.length) % LOCATIONS.length],
          `+855 12 ${day.slice(8)}${n} ${String(100 + i * 7).slice(-3)}`,
          codUsd,
          codUsd,
          codRiel,
          +(codUsd + codRiel / RIEL_PER_USD).toFixed(2),
          1.5,
          status,
          reason ?? '',
          'TEST record',
          deliveredAt,
          TAG,
        ],
      );
      parcelCount += 1;
    }
  }

  // Activity timeline rows, derived from each settlement's own status timestamps.
  let historyCount = 0;
  for (const s of settlements) {
    const steps = [['PENDING', s.createdAt]];
    if (s.submittedAt || ['SUBMITTED', 'APPROVED', 'REJECTED'].includes(s.status)) {
      steps.push(['SUBMITTED', s.submittedAt ?? new Date(new Date(s.createdAt).getTime() + 2 * 3600e3)]);
    }
    if (s.status === 'APPROVED') steps.push(['APPROVED', s.approvedAt ?? new Date(new Date(s.createdAt).getTime() + 5 * 3600e3)]);
    if (s.status === 'REJECTED') steps.push(['REJECTED', s.rejectedAt ?? new Date(new Date(s.createdAt).getTime() + 5 * 3600e3)]);

    for (const [status, at] of steps) {
      await c.query(
        `INSERT INTO "DriverCodSettlementHistories"
           ("driverCodSettlementId", status, "requestedAmount", "settledAmount", "rejectReason", "actionById", "actionByName", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          s.id,
          status,
          s.requestedAmount,
          s.settledAmount,
          status === 'REJECTED' ? s.rejectReason || 'Transfer screenshot does not match the amount' : '',
          TAG,
          status === 'SUBMITTED' ? 'John Doe' : 'TEST Operation',
          at,
        ],
      );
      historyCount += 1;
    }
  }
  return { settlements: settlements.map((s) => `${s.refNo} (${s.day}, ${s.status})`), parcelCount, historyCount };
}

(async () => {
  const cleanOnly = process.argv.includes('--clean');
  const c = connect();
  await c.connect();
  try {
    await c.query('BEGIN');
    const removed = await clean(c);
    const result = cleanOnly ? null : await seed(c);
    await c.query('COMMIT');
    console.log(`Removed previous seed: ${removed.parcels} parcel rows, ${removed.history} history rows.`);
    if (result) {
      console.log(`Inserted ${result.parcelCount} parcel rows and ${result.historyCount} history rows for:`);
      result.settlements.forEach((s) => console.log(`  - ${s}`));
    }
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Failed, nothing was changed:', err.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
