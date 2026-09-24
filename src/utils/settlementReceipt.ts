// Draws a COD settlement "digital receipt" as a PNG, entirely on the device (canvas),
// so it can be downloaded or shared (Telegram, etc.) without any server support.
// Photos (transfer screenshots) are deliberately not drawn: they come from another
// origin without CORS headers and would make the canvas unexportable.

export interface ReceiptRow {
  label: string;
  value: string;
  strong?: boolean;
}

export interface ReceiptStep {
  label: string;
  time: string;
  by?: string;
}

export interface ReceiptParcel {
  code: string;
  status: string;
  cod: string;
}

export interface SettlementReceiptData {
  refNo: string;
  statusLabel: string;
  statusColor: string;
  headline: { label: string; value: string };
  driver: { name: string; phone?: string };
  period: string;
  amounts: ReceiptRow[];
  paidTo?: { name?: string; number?: string };
  timeline: ReceiptStep[];
  parcelSummary?: string;
  parcels: ReceiptParcel[];
  note?: string;
  generatedAt: string;
}

const W = 720; // logical width; drawn at 2x for sharp text
const PAD = 40;
const SCALE = 2;
const MAX_PARCELS = 20;

const C = {
  green: '#1a9c4b',
  greenStrong: '#1e7a22',
  ink: '#1f2937',
  text3: '#4b5563',
  muted: '#6b7280',
  line: '#e5e7eb',
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

type Ctx = CanvasRenderingContext2D;

// One layout pass that either only measures (returns the height) or also draws.
function layout(ctx: Ctx, d: SettlementReceiptData, draw: boolean): number {
  let y = 0;

  const text = (s: string, x: number, yy: number, font: string, color: string, align: CanvasTextAlign = 'left') => {
    if (!draw) return;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, yy);
  };
  const fit = (s: string, font: string, maxWidth: number) => {
    ctx.font = font;
    if (ctx.measureText(s).width <= maxWidth) return s;
    let out = s;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
    return `${out}…`;
  };
  const rule = (yy: number, dashed = false) => {
    if (!draw) return;
    ctx.save();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.5;
    if (dashed) ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(PAD, yy);
    ctx.lineTo(W - PAD, yy);
    ctx.stroke();
    ctx.restore();
  };
  const section = (title: string) => {
    y += 34;
    text(title.toUpperCase(), PAD, y, `700 13px ${FONT}`, C.muted);
    y += 12;
  };
  const row = (label: string, value: string, strong = false) => {
    y += 30;
    text(label, PAD, y, `${strong ? 700 : 500} 16px ${FONT}`, strong ? C.ink : C.text3);
    text(value, W - PAD, y, `${strong ? 800 : 700} ${strong ? 18 : 16}px ${FONT}`, strong ? C.greenStrong : C.ink, 'right');
  };

  // ---- header band ----
  if (draw) {
    ctx.fillStyle = C.green;
    ctx.fillRect(0, 0, W, 112);
  }
  text('Jalat Logistics', PAD, 50, `800 26px ${FONT}`, '#ffffff');
  text('COD Settlement Receipt', PAD, 82, `600 16px ${FONT}`, 'rgba(255,255,255,0.88)');
  text(d.refNo, W - PAD, 50, `700 18px ${MONO}`, '#ffffff', 'right');
  text(d.period, W - PAD, 82, `500 15px ${FONT}`, 'rgba(255,255,255,0.88)', 'right');
  y = 112;

  // ---- status + headline amount ----
  y += 44;
  if (draw) {
    ctx.font = `800 14px ${FONT}`;
    const label = d.statusLabel.toUpperCase();
    const w = ctx.measureText(label).width + 28;
    ctx.fillStyle = d.statusColor;
    ctx.beginPath();
    // roundRect is missing on older Safari — a square pill is fine there.
    if (typeof ctx.roundRect === 'function') ctx.roundRect((W - w) / 2, y - 22, w, 32, 16);
    else ctx.rect((W - w) / 2, y - 22, w, 32);
    ctx.fill();
    text(label, W / 2, y, `800 14px ${FONT}`, '#ffffff', 'center');
  }
  y += 36;
  text(d.headline.label, W / 2, y, `600 15px ${FONT}`, C.muted, 'center');
  y += 50;
  text(d.headline.value, W / 2, y, `800 44px ${FONT}`, C.ink, 'center');
  y += 26;
  rule(y);

  // ---- driver ----
  section('Driver');
  y += 16;
  text(d.driver.name, PAD, y + 8, `700 17px ${FONT}`, C.ink);
  if (d.driver.phone) text(d.driver.phone, W - PAD, y + 8, `500 16px ${FONT}`, C.text3, 'right');
  y += 8;

  // ---- amounts ----
  section('Amounts');
  d.amounts.forEach((r, i) => {
    if (r.strong && i > 0) {
      y += 12;
      rule(y, true);
    }
    row(r.label, r.value, r.strong);
  });

  // ---- paid to ----
  if (d.paidTo?.name || d.paidTo?.number) {
    section('Paid to');
    if (d.paidTo.name) row('Account name', d.paidTo.name);
    if (d.paidTo.number) row('Account number', d.paidTo.number);
  }

  // ---- timeline ----
  if (d.timeline.length) {
    section('Timeline');
    for (const step of d.timeline) {
      y += 30;
      if (draw) {
        ctx.fillStyle = C.green;
        ctx.beginPath();
        ctx.arc(PAD + 6, y - 6, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      text(step.label + (step.by ? ` · ${step.by}` : ''), PAD + 22, y, `600 16px ${FONT}`, C.ink);
      text(step.time, W - PAD, y, `500 15px ${FONT}`, C.muted, 'right');
    }
  }

  // ---- parcels ----
  if (d.parcels.length || d.parcelSummary) {
    section('Parcels');
    if (d.parcelSummary) {
      y += 26;
      text(d.parcelSummary, PAD, y, `600 15px ${FONT}`, C.text3);
    }
    const shown = d.parcels.slice(0, MAX_PARCELS);
    for (const p of shown) {
      y += 28;
      text(fit(p.code, `600 15px ${MONO}`, 250), PAD, y, `600 15px ${MONO}`, C.ink);
      text(p.status, PAD + 270, y, `500 15px ${FONT}`, C.muted);
      text(p.cod, W - PAD, y, `700 15px ${FONT}`, C.ink, 'right');
    }
    if (d.parcels.length > shown.length) {
      y += 28;
      text(`+ ${d.parcels.length - shown.length} more parcels`, PAD, y, `500 15px ${FONT}`, C.muted);
    }
  }

  // ---- note ----
  if (d.note) {
    section('Driver note');
    y += 26;
    text(fit(d.note, `500 15px ${FONT}`, W - PAD * 2), PAD, y, `500 15px ${FONT}`, C.text3);
  }

  // ---- footer ----
  y += 36;
  rule(y);
  y += 30;
  text(`Generated ${d.generatedAt} · Jalat Driver App`, W / 2, y, `500 13px ${FONT}`, C.muted, 'center');
  y += 22;
  text('Transfer screenshot is on file with the settlement.', W / 2, y, `500 13px ${FONT}`, C.muted, 'center');
  y += 32;
  return y;
}

export async function renderSettlementReceipt(data: SettlementReceiptData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create the receipt image.');

  const height = layout(ctx, data, false);
  canvas.width = W * SCALE;
  canvas.height = Math.ceil(height * SCALE);
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, height);
  layout(ctx, data, true);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the receipt image.'))), 'image/png'),
  );
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Opens the phone's share sheet with the receipt file when the browser supports it
// (iOS Safari, Android Chrome). Returns false when it can't, so the caller can download.
export async function shareFile(blob: Blob, fileName: string, title: string, text: string): Promise<boolean> {
  const file = new File([blob], fileName, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], title, text });
    return true;
  } catch (err) {
    // The driver closed the share sheet — not an error, and nothing to fall back to.
    if ((err as { name?: string }).name === 'AbortError') return true;
    throw err;
  }
}
