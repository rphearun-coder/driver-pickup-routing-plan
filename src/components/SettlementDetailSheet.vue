<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  getCodPaymentAccount,
  getSettlementParcels,
  type CodSettlementHistoryItem,
  type DriverCodSettlementStatus,
  type SettlementParcel,
} from '../api/cod-settlement';
import { getOperationByDriver, sendNotificationToOperation, type DriverOperator } from '../api/notifications';
import { resolveParcelImageUrl } from '../api/parcels';
import { downloadBlob, renderSettlementReceipt, shareFile } from '../utils/settlementReceipt';
import ImageLightbox from './ImageLightbox.vue';
import CloseButton from './CloseButton.vue';

// Read-only details of one settlement from SettlementHistoryPage. The summary comes
// from the already-loaded list row; only the parcel list is fetched on open.
const props = defineProps<{ item: CodSettlementHistoryItem }>();
const emit = defineEmits<{ close: []; sendReceipt: [] }>();
const router = useRouter();

const PARCEL_STATUS: Record<string, { label: string; tone: string }> = {
  SUCCESS: { label: 'Delivered', tone: 'green' },
  FAILED: { label: 'Failed', tone: 'red' },
  BE_RETURN: { label: 'To return', tone: 'orange' },
  RETURN: { label: 'Returned', tone: 'grey' },
};
const PARCEL_PREVIEW = 5;

const parcels = ref<SettlementParcel[]>([]);
const parcelsLoading = ref(true);
const parcelsError = ref('');
const showAllParcels = ref(false);

const visibleParcels = computed(() => (showAllParcels.value ? parcels.value : parcels.value.slice(0, PARCEL_PREVIEW)));

async function loadParcels(): Promise<void> {
  parcelsLoading.value = true;
  parcelsError.value = '';
  try {
    parcels.value = await getSettlementParcels(props.item.driverId, props.item.startAt, props.item.endAt);
  } catch (err: any) {
    parcelsError.value = err.message ?? 'Failed to load parcels';
  } finally {
    parcelsLoading.value = false;
  }
}

function parcelCod(p: SettlementParcel): string {
  const riel = Math.round(p.codRiel ?? 0);
  if (!p.codUsd && riel) return `${riel.toLocaleString()}៛`;
  return `${formatUSD(p.codUsd)}${riel ? ` + ${riel.toLocaleString()}៛` : ''}`;
}

function parcelTime(p: SettlementParcel): string {
  if (!p.deliveredAt) return '';
  return new Date(p.deliveredAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function openParcel(p: SettlementParcel): void {
  emit('close');
  router.push({ name: 'parcel-detail', params: { id: p.parcelId } });
}

const STATUS_META: Record<DriverCodSettlementStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Ready to settle', tone: 'orange' },
  SUBMITTED: { label: 'Waiting for approval', tone: 'blue' },
  APPROVED: { label: 'Approved', tone: 'green' },
  REJECTED: { label: 'Rejected', tone: 'red' },
};
const ACTIVITY_LABEL: Record<DriverCodSettlementStatus, string> = {
  PENDING: 'Settlement created',
  SUBMITTED: 'Receipt sent',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

const proofViewUrl = ref('');
const copied = ref(false);

const meta = computed(() => STATUS_META[props.item.status] ?? { label: props.item.status, tone: 'grey' });

function formatUSD(amount?: number): string {
  return `$${(amount ?? 0).toFixed(2)}`;
}

function formatDay(value?: string): string {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value?: string): string {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const period = computed(() => {
  const start = formatDay(props.item.startAt);
  const end = formatDay(props.item.endAt);
  return start === end ? start : `${start} – ${end}`;
});

const headlineAmount = computed(() => props.item.settledAmount ?? 0);
const headlineLabel = computed(() => (props.item.status === 'APPROVED' ? 'Settled amount' : 'Amount to transfer'));
// PayWay + transfer is the settlement's full amount (see the server's $getReservedAmount).
const settlementTotal = computed(() => (props.item.requestedAmount ?? 0) + (props.item.settledAmount ?? 0));

// The list row's totalCodUsd/Khr is summed over the history page's date filter, not this
// settlement's period — so COD here comes from this settlement's own delivered parcels
// (SUCCESS only, the same rule the server uses for COD totals).
const delivered = computed(() => parcels.value.filter((p) => p.status === 'SUCCESS'));
const codUsd = computed(() => delivered.value.reduce((sum, p) => sum + (p.codUsd ?? 0), 0));
const codKhr = computed(() => Math.round(delivered.value.reduce((sum, p) => sum + (p.codRiel ?? 0), 0)));
const codText = computed(() => (parcelsLoading.value ? '…' : parcelsError.value ? '—' : formatUSD(codUsd.value)));

const proofs = computed(() => {
  const keys = [...(props.item.proofImages ?? []), props.item.proofImage].filter((key): key is string => !!key);
  return [...new Set(keys)].map(resolveParcelImageUrl).filter(Boolean);
});

interface ActivityRow {
  key: string;
  label: string;
  tone: string;
  time: string;
  by?: string;
  note?: string;
}

// Prefer the server's audit trail; fall back to the status timestamps for old rows.
const activity = computed<ActivityRow[]>(() => {
  const history = props.item.history ?? [];
  if (history.length) {
    return [...history]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((row, index) => ({
        key: `${row.createdAt}-${index}`,
        label: ACTIVITY_LABEL[row.status] ?? row.status,
        tone: STATUS_META[row.status]?.tone ?? 'grey',
        time: formatDateTime(row.createdAt),
        by: row.actionByName,
        note:
          row.status === 'REJECTED' && row.rejectReason
            ? row.rejectReason
            : row.settledAmount != null && row.status === 'APPROVED'
              ? `Settled ${formatUSD(row.settledAmount)}`
              : undefined,
      }));
  }
  const rows: ActivityRow[] = [];
  const { item } = props;
  if (item.rejectedAt) rows.push({ key: 'rejected', label: 'Rejected', tone: 'red', time: formatDateTime(item.rejectedAt), by: item.reviewedByName, note: item.rejectReason });
  if (item.approvedAt) rows.push({ key: 'approved', label: 'Approved', tone: 'green', time: formatDateTime(item.approvedAt), by: item.reviewedByName });
  if (item.submittedAt) rows.push({ key: 'submitted', label: 'Receipt sent', tone: 'blue', time: formatDateTime(item.submittedAt) });
  rows.push({ key: 'created', label: 'Settlement created', tone: 'orange', time: formatDateTime(item.createdAt), by: item.createdByName });
  return rows;
});

// ---- digital receipt: download, and share with Operation --------------------------
// Only once money has moved: the receipt was sent (SUBMITTED) or approved.
const canReceipt = computed(() => props.item.status === 'SUBMITTED' || props.item.status === 'APPROVED');
const receiptBusy = ref<'' | 'download' | 'share'>('');
const receiptMessage = ref<{ text: string; tone: 'ok' | 'error' } | null>(null);
const operators = ref<DriverOperator[]>([]);
const receiptFileName = computed(() => `Jalat-COD-receipt-${props.item.refNo}.png`);

async function loadOperators(): Promise<void> {
  try {
    operators.value = await getOperationByDriver(props.item.driverId);
  } catch {
    operators.value = []; // informational only
  }
}

async function buildReceipt(): Promise<Blob> {
  const { item } = props;
  const account = await getCodPaymentAccount().catch(() => null);
  const approved = item.status === 'APPROVED';
  return renderSettlementReceipt({
    refNo: item.refNo,
    statusLabel: meta.value.label,
    statusColor: approved ? '#1a9c4b' : '#1a73e8',
    headline: { label: headlineLabel.value, value: formatUSD(headlineAmount.value) },
    driver: { name: item.driverName || 'Driver', phone: item.driverPhoneNumber },
    period: period.value,
    amounts: [
      { label: 'COD delivered (USD)', value: formatUSD(codUsd.value) },
      ...(codKhr.value ? [{ label: 'COD delivered (KHR)', value: `${codKhr.value.toLocaleString()} KHR` }] : []),
      { label: 'Paid via PayWay', value: formatUSD(item.requestedAmount) },
      { label: approved ? 'Settled by transfer' : 'Transferred', value: formatUSD(item.settledAmount) },
      { label: 'Settlement total', value: formatUSD(settlementTotal.value), strong: true },
    ],
    paidTo: account ? { name: account.accountName, number: account.accountNumber } : undefined,
    timeline: [...activity.value].reverse().map((row) => ({ label: row.label, time: row.time, by: row.by })),
    parcelSummary: parcels.value.length
      ? `${delivered.value.length} delivered of ${parcels.value.length} parcels · ${formatUSD(codUsd.value)} COD`
      : undefined,
    parcels: parcels.value.map((p) => ({
      code: p.parcelUID || p.parcelId.slice(0, 8),
      status: PARCEL_STATUS[p.status]?.label ?? p.status,
      cod: parcelCod(p).replace('៛', ' KHR'), // the canvas font may lack the riel glyph
    })),
    note: item.driverNote || undefined,
    generatedAt: new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
  });
}

async function downloadReceipt(): Promise<void> {
  if (receiptBusy.value) return;
  receiptBusy.value = 'download';
  receiptMessage.value = null;
  try {
    downloadBlob(await buildReceipt(), receiptFileName.value);
    receiptMessage.value = { text: 'Receipt downloaded.', tone: 'ok' };
  } catch (err: any) {
    receiptMessage.value = { text: err.message ?? 'Could not create the receipt.', tone: 'error' };
  } finally {
    receiptBusy.value = '';
  }
}

// Notifies every Operation user in-app (the server can't target one operator or attach
// files), then hands the receipt image to the phone's share sheet so the driver can send
// it to their operator (Telegram, etc.). Without a share sheet it's downloaded instead.
async function shareReceipt(): Promise<void> {
  if (receiptBusy.value) return;
  receiptBusy.value = 'share';
  receiptMessage.value = null;
  const { item } = props;
  try {
    const blob = await buildReceipt();
    const title = `COD receipt · ${item.refNo}`;
    const body = `${item.driverName || 'A driver'} · ${formatUSD(settlementTotal.value)} · ${meta.value.label} · ${period.value}`;
    const [notified, shared] = await Promise.allSettled([
      sendNotificationToOperation({ type: 'COD_SETTLEMENT_RECEIPT', title, body, refId: item.id }),
      shareFile(blob, receiptFileName.value, title, body),
    ]);
    const sheetOpened = shared.status === 'fulfilled' && shared.value;
    if (!sheetOpened) downloadBlob(blob, receiptFileName.value);
    const parts = [
      notified.status === 'fulfilled' ? 'Operation notified' : "Couldn't notify Operation",
      sheetOpened ? '' : 'receipt downloaded — send it to your operator',
    ].filter(Boolean);
    receiptMessage.value = { text: `${parts.join(' · ')}.`, tone: notified.status === 'fulfilled' ? 'ok' : 'error' };
  } catch (err: any) {
    receiptMessage.value = { text: err.message ?? 'Could not share the receipt.', tone: 'error' };
  } finally {
    receiptBusy.value = '';
  }
}

async function copyRef(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.item.refNo);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // Clipboard can be blocked (http, permissions) — the ref is still visible to read.
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !proofViewUrl.value) emit('close');
}

const previousBodyOverflow = document.body.style.overflow;
onMounted(() => {
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', onKeydown);
  loadParcels();
  if (canReceipt.value) loadOperators();
});
onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow;
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="#overlay-root">
    <div class="sheet-backdrop" @click.self="emit('close')">
      <div class="sheet" :class="meta.tone" role="dialog" aria-modal="true" aria-labelledby="settlement-detail-title">
        <span class="drag-handle"></span>

        <div class="sheet-head">
          <h2 id="settlement-detail-title">Settlement details</h2>
          <CloseButton @click="emit('close')" />
        </div>

        <section class="hero">
          <span class="status-badge">{{ meta.label }}</span>
          <span class="hero-label">{{ headlineLabel }}</span>
          <strong class="hero-value">{{ formatUSD(headlineAmount) }}</strong>
          <button type="button" class="ref-btn" @click="copyRef">
            {{ item.refNo }}
            <span class="ref-copy">{{ copied ? 'Copied' : 'Copy' }}</span>
          </button>
        </section>

        <p v-if="item.status === 'REJECTED' && item.rejectReason" class="reject-reason">
          <strong>Why it was rejected:</strong> {{ item.rejectReason }}
        </p>

        <section class="block">
          <h3>Amounts</h3>
          <dl class="rows">
            <div><dt>COD delivered (USD)</dt><dd>{{ codText }}</dd></div>
            <div v-if="codKhr"><dt>COD delivered (KHR)</dt><dd>{{ codKhr.toLocaleString() }}៛</dd></div>
            <div><dt>Paid via PayWay</dt><dd>{{ formatUSD(item.requestedAmount) }}</dd></div>
            <div><dt>{{ item.status === 'APPROVED' ? 'Settled by transfer' : 'To transfer' }}</dt><dd>{{ formatUSD(item.settledAmount) }}</dd></div>
            <div class="total"><dt>Settlement total</dt><dd>{{ formatUSD(settlementTotal) }}</dd></div>
          </dl>
        </section>

        <section class="block">
          <h3>
            Parcels
            <span v-if="!parcelsLoading && !parcelsError" class="count">{{ parcels.length }}</span>
          </h3>

          <ul v-if="parcelsLoading" class="parcels" aria-hidden="true">
            <li v-for="n in 3" :key="n" class="parcel skeleton"><span class="sk"></span><span class="sk short"></span></li>
          </ul>

          <div v-else-if="parcelsError" class="parcels-state">
            <span>{{ parcelsError }}</span>
            <button type="button" class="link-btn" @click="loadParcels">Try again</button>
          </div>

          <p v-else-if="!parcels.length" class="parcels-state">
            No delivered, failed or returned parcels for {{ period }}.
          </p>

          <template v-else>
            <p class="parcels-summary">
              {{ delivered.length }} delivered · {{ formatUSD(codUsd) }} COD
            </p>
            <ul class="parcels">
              <li v-for="p in visibleParcels" :key="p.id">
                <button type="button" class="parcel" :class="PARCEL_STATUS[p.status]?.tone ?? 'grey'" @click="openParcel(p)">
                  <span class="parcel-dot" aria-hidden="true"></span>
                  <span class="parcel-main">
                    <span class="parcel-top">
                      <span class="parcel-uid">{{ p.parcelUID || p.parcelId.slice(0, 8) }}</span>
                      <span class="parcel-status">{{ PARCEL_STATUS[p.status]?.label ?? p.status }}</span>
                    </span>
                    <span class="parcel-sub">{{ p.recipientNumber }}<template v-if="p.location"> · {{ p.location }}</template></span>
                    <span v-if="p.status === 'FAILED' && p.reason" class="parcel-reason">{{ p.reason }}</span>
                  </span>
                  <span class="parcel-side">
                    <strong>{{ parcelCod(p) }}</strong>
                    <span>{{ parcelTime(p) }}</span>
                  </span>
                </button>
              </li>
            </ul>
            <button
              v-if="parcels.length > PARCEL_PREVIEW"
              type="button"
              class="show-all"
              @click="showAllParcels = !showAllParcels"
            >
              {{ showAllParcels ? 'Show less' : `Show all ${parcels.length} parcels` }}
            </button>
          </template>
        </section>

        <section class="block">
          <h3>Info</h3>
          <dl class="rows">
            <div><dt>Period</dt><dd>{{ period }}</dd></div>
            <div><dt>Created</dt><dd>{{ formatDateTime(item.createdAt) }}</dd></div>
            <div v-if="item.createdByName"><dt>Requested by</dt><dd>{{ item.createdByName }}</dd></div>
            <div v-if="item.reviewedByName"><dt>Reviewed by</dt><dd>{{ item.reviewedByName }}</dd></div>
          </dl>
          <p v-if="item.driverNote" class="note"><span>Your note</span>{{ item.driverNote }}</p>
        </section>

        <section v-if="proofs.length" class="block">
          <h3>Transfer screenshot{{ proofs.length > 1 ? 's' : '' }} <span class="count">{{ proofs.length }}</span></h3>
          <div class="proofs">
            <button
              v-for="(url, index) in proofs"
              :key="url"
              type="button"
              class="proof"
              :aria-label="`View screenshot ${index + 1}`"
              @click="proofViewUrl = url"
            >
              <img :src="url" alt="" loading="lazy" />
            </button>
          </div>
        </section>

        <section class="block">
          <h3>Activity</h3>
          <ol class="activity">
            <li v-for="row in activity" :key="row.key" :class="row.tone">
              <span class="act-dot" aria-hidden="true"></span>
              <div class="act-body">
                <div class="act-top">
                  <span class="act-label">{{ row.label }}</span>
                  <span class="act-time">{{ row.time }}</span>
                </div>
                <span v-if="row.by" class="act-by">by {{ row.by }}</span>
                <span v-if="row.note" class="act-note">{{ row.note }}</span>
              </div>
            </li>
          </ol>
        </section>

        <section class="block receipt-block">
          <h3>Digital receipt</h3>
          <template v-if="canReceipt">
            <p class="receipt-hint">
              A receipt image with the amounts, account paid to, timeline and parcels. Share it with Operation or keep it for your records.
            </p>
            <div class="receipt-actions">
              <button type="button" class="receipt-btn" :disabled="!!receiptBusy || parcelsLoading" @click="downloadReceipt">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 4v11M7 10l5 5 5-5M5 19h14" />
                </svg>
                {{ receiptBusy === 'download' ? 'Creating…' : 'Download' }}
              </button>
              <button type="button" class="receipt-btn primary" :disabled="!!receiptBusy || parcelsLoading" @click="shareReceipt">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" />
                  <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
                </svg>
                {{ receiptBusy === 'share' ? 'Sharing…' : 'Share with Operation' }}
              </button>
            </div>
            <p v-if="operators.length" class="receipt-operators">
              Your operator{{ operators.length > 1 ? 's' : '' }}:
              <template v-for="(op, i) in operators" :key="op.id">
                <b>{{ op.fullName || op.username }}</b><template v-if="op.phoneNumber"> ({{ op.phoneNumber }})</template><template v-if="i < operators.length - 1">, </template>
              </template>
            </p>
            <p v-if="receiptMessage" class="receipt-message" :class="receiptMessage.tone" role="status">{{ receiptMessage.text }}</p>
          </template>
          <p v-else class="receipt-hint">
            {{ item.status === 'PENDING' ? 'Available after you send the transfer receipt.' : 'Not available for a rejected settlement.' }}
          </p>
        </section>

        <button v-if="item.status === 'PENDING'" type="button" class="primary-btn" @click="emit('sendReceipt')">
          Send receipt
        </button>
      </div>
    </div>

    <ImageLightbox
      v-if="proofViewUrl"
      :src="proofViewUrl"
      alt="Transfer screenshot"
      caption="Transfer screenshot · tap to close"
      @close="proofViewUrl = ''"
    />
  </Teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(17, 24, 39, 0.45);
  overscroll-behavior: contain;
  animation: fade-in 0.2s ease;
}
.sheet {
  --tone: var(--muted);
  --tone-soft: var(--fill);
  --tone-strong: var(--text-3);
  width: 100%;
  max-width: 480px;
  max-height: 92%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 16px calc(20px + env(safe-area-inset-bottom));
  border-radius: 24px 24px 0 0;
  background: var(--page);
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.18);
  animation: slide-up 0.22s ease;
}
.sheet.orange {
  --tone: var(--orange);
  --tone-soft: var(--orange-soft);
  --tone-strong: var(--orange-strong);
}
.sheet.blue {
  --tone: var(--blue);
  --tone-soft: var(--blue-soft);
  --tone-strong: var(--blue-strong);
}
.sheet.green {
  --tone: var(--green);
  --tone-soft: var(--green-soft);
  --tone-strong: var(--green-strong);
}
.sheet.red {
  --tone: var(--red);
  --tone-soft: var(--red-soft);
  --tone-strong: var(--red-strong);
}
.drag-handle {
  display: block;
  width: 40px;
  height: 4px;
  margin: 0 auto 12px;
  border-radius: 999px;
  background: var(--line);
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 12px;
}
.sheet-head h2 {
  margin: 0;
  color: var(--ink);
  font: 700 1.1rem var(--heading);
}
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 18px 16px 14px;
  border-radius: 18px;
  background: #fff;
  border-top: 4px solid var(--tone);
  text-align: center;
}
.status-badge {
  padding: 4px 11px;
  border-radius: 999px;
  background: var(--tone-soft);
  color: var(--tone-strong);
  font: 700 0.7rem var(--sans);
}
.hero-label {
  margin-top: 8px;
  color: var(--muted);
  font: 600 0.74rem var(--sans);
}
.hero-value {
  color: var(--ink-strong);
  font: 800 2rem var(--sans);
  letter-spacing: -0.01em;
}
.ref-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  margin-top: 6px;
  padding: 5px 6px 5px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--wash);
  color: var(--text-2);
  font: 700 0.78rem ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
}
.ref-copy {
  padding: 2px 8px;
  border-radius: 999px;
  background: #fff;
  color: var(--blue);
  font: 700 0.66rem var(--sans);
}
.reject-reason {
  margin: 10px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--red-soft);
  color: var(--red-deep);
  font: 500 0.8rem var(--sans);
}
.block {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: #fff;
}
.block h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  color: var(--muted);
  font: 700 0.7rem var(--sans);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--fill);
  letter-spacing: 0;
}
.rows {
  margin: 0;
}
.rows div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--divider);
}
.rows div:last-child {
  border-bottom: none;
}
.rows dt {
  color: var(--text-3);
  font: 500 0.82rem var(--sans);
}
.rows dd {
  margin: 0;
  color: var(--ink);
  font: 700 0.82rem var(--sans);
  text-align: right;
}
.rows .total {
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-dashed);
  border-bottom: none;
}
.rows .total dt {
  color: var(--ink);
  font-weight: 700;
}
.rows .total dd {
  color: var(--tone-strong);
  font-size: 0.98rem;
  font-weight: 800;
}
.note {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 6px 0 0;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--wash);
  color: var(--text-2);
  font: 500 0.8rem var(--sans);
}
.note span {
  color: var(--muted);
  font: 700 0.68rem var(--sans);
}
.proofs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 8px;
  margin-top: 4px;
}
.proof {
  aspect-ratio: 1;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--input);
  cursor: zoom-in;
}
.proof img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.activity {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
}
.activity li {
  --dot: var(--muted);
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 14px;
}
.activity li:last-child {
  padding-bottom: 0;
}
.activity li:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 14px;
  bottom: 0;
  left: 5px;
  width: 2px;
  background: var(--border-dashed);
}
.activity li.orange { --dot: var(--orange); }
.activity li.blue { --dot: var(--blue); }
.activity li.green { --dot: var(--green); }
.activity li.red { --dot: var(--red); }
.act-dot {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  margin-top: 3px;
  border-radius: 50%;
  background: var(--dot);
  box-shadow: 0 0 0 3px #fff;
}
.act-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.act-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.act-label {
  color: var(--ink);
  font: 700 0.82rem var(--sans);
}
.act-time {
  flex-shrink: 0;
  color: var(--muted);
  font: 500 0.72rem var(--sans);
}
.act-by {
  color: var(--text-3);
  font: 500 0.74rem var(--sans);
}
.act-note {
  color: var(--text-2);
  font: 500 0.76rem var(--sans);
}
.parcels-summary {
  margin: 0 0 6px;
  color: var(--text-3);
  font: 600 0.78rem var(--sans);
}
.parcels-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 4px 0 2px;
  color: var(--muted);
  font: 500 0.8rem var(--sans);
}
.link-btn {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--blue);
  font: 700 0.8rem var(--sans);
  cursor: pointer;
}
.parcels {
  list-style: none;
  margin: 0;
  padding: 0;
}
.parcels li + li {
  border-top: 1px solid var(--divider);
}
.parcel {
  --dot: var(--faint);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 10px 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.parcel.green { --dot: var(--green); }
.parcel.red { --dot: var(--red); }
.parcel.orange { --dot: var(--orange); }
.parcel-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--dot);
}
.parcel-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.parcel-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.parcel-uid {
  overflow: hidden;
  color: var(--ink);
  font: 700 0.8rem ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.parcel-status {
  flex-shrink: 0;
  color: var(--dot);
  font: 700 0.66rem var(--sans);
}
.parcel-sub,
.parcel-reason {
  overflow: hidden;
  color: var(--muted);
  font: 500 0.72rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.parcel-reason {
  color: var(--red-strong);
}
.parcel-side {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.parcel-side strong {
  color: var(--ink);
  font: 700 0.82rem var(--sans);
}
.parcel-side span {
  color: var(--faint);
  font: 500 0.66rem var(--sans);
}
.parcel.skeleton {
  flex-direction: column;
  gap: 6px;
  cursor: default;
}
.sk {
  display: block;
  width: 100%;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--track) 25%, var(--page) 50%, var(--track) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
.sk.short {
  width: 55%;
}
.show-all {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 10px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: #fff;
  color: var(--ink);
  font: 700 0.78rem var(--sans);
  cursor: pointer;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
.receipt-hint {
  margin: 0;
  color: var(--muted);
  font: 500 0.78rem/1.45 var(--sans);
}
.receipt-actions {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 8px;
  margin-top: 10px;
}
.receipt-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  padding: 11px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: #fff;
  color: var(--ink);
  font: 700 0.8rem var(--sans);
  white-space: nowrap;
  cursor: pointer;
}
.receipt-btn.primary {
  border-color: var(--green);
  background: var(--green);
  color: #fff;
}
.receipt-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}
.receipt-btn svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}
.receipt-operators {
  margin: 10px 0 0;
  color: var(--text-3);
  font: 500 0.74rem var(--sans);
}
.receipt-message {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 10px;
  font: 600 0.76rem var(--sans);
}
.receipt-message.ok {
  background: var(--green-soft);
  color: var(--green-strong);
}
.receipt-message.error {
  background: var(--red-soft);
  color: var(--red-deep);
}
.primary-btn {
  display: block;
  width: 100%;
  margin-top: 14px;
  padding: 14px;
  border: none;
  border-radius: 14px;
  background: var(--green);
  color: #fff;
  font: 700 0.92rem var(--sans);
  cursor: pointer;
}
@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
}
@keyframes fade-in {
  from {
    background-color: transparent;
  }
}
</style>
