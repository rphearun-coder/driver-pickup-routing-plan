<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  getUserNotifications,
  markNotificationRead,
  type UserNotification,
} from '../api/notifications';
import AppToast from '../components/AppToast.vue';
import StateBlock from '../components/StateBlock.vue';
import { useToast } from '../composables/useToast';

const router = useRouter();
const toast = useToast();

const PAGE_SIZE = 30;
const notifications = ref<UserNotification[]>([]);
const total = ref(0);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');
const markingAll = ref(false);
const expanded = ref(new Set<number>());
const filter = ref<'all' | 'unread'>('all');

const unreadCount = computed(() => notifications.value.filter((n) => !n.isRead).length);
const visible = computed(() =>
  filter.value === 'unread' ? notifications.value.filter((n) => !n.isRead) : notifications.value,
);
const hasMore = computed(() => notifications.value.length < total.value);

// ---- kind: icon + colour, guessed from the title (the API has no category field) ----
type Kind = 'settlement' | 'pickup' | 'return' | 'delivery' | 'general';
const KIND_RULES: [Kind, RegExp][] = [
  ['settlement', /settle|cod\b|receipt|payway|transfer|payment/i],
  ['return', /return/i],
  ['pickup', /pick ?up/i],
  ['delivery', /deliver|parcel|failed/i],
];
function kindOf(n: UserNotification): Kind {
  return KIND_RULES.find(([, re]) => re.test(n.title))?.[0] ?? 'general';
}

// ---- body: Operation writes HTML in a rich-text editor ----------------------------
// Shown as plain text with paragraph breaks kept. Never v-html: the body is
// user-written content. DOMParser doesn't run scripts or load images.
function plainText(body?: string): string {
  if (!body || !/[<&]/.test(body)) return body ?? '';
  const withBreaks = body.replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, '$&\n');
  const text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? '';
  return text.replace(/\n{2,}/g, '\n').trim();
}
const LONG_BODY = 110;

// ---- dates: "Today" / "Yesterday" / "Mon, Sep 21" groups, "5 min ago" times --------
function dayKey(value?: string): string {
  const d = value ? new Date(value) : new Date(0);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function groupLabel(value?: string): string {
  if (!value) return 'Earlier';
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKey(value) === dayKey(today.toISOString())) return 'Today';
  if (dayKey(value) === dayKey(yesterday.toISOString())) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  });
}
function timeText(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  const minutes = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 6 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const groups = computed(() => {
  const out: { label: string; items: UserNotification[] }[] = [];
  for (const n of visible.value) {
    const label = groupLabel(n.createdAt);
    const last = out[out.length - 1];
    if (last?.label === label) last.items.push(n);
    else out.push({ label, items: [n] });
  }
  return out;
});

// ---- data ----------------------------------------------------------------------------
async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const { results, metadata } = await getUserNotifications(PAGE_SIZE, 0);
    notifications.value = results;
    total.value = metadata.total;
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load notifications';
  } finally {
    loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const { results, metadata } = await getUserNotifications(PAGE_SIZE, notifications.value.length);
    notifications.value = [...notifications.value, ...results];
    total.value = metadata.total;
  } catch (err: any) {
    toast.show(err.message ?? 'Failed to load more', 'error');
  } finally {
    loadingMore.value = false;
  }
}

// Tapping a card expands a long body and marks it read (optimistically).
async function open(n: UserNotification): Promise<void> {
  if (plainText(n.body).length > LONG_BODY) {
    const next = new Set(expanded.value);
    if (next.has(n.id)) next.delete(n.id);
    else next.add(n.id);
    expanded.value = next;
  }
  await markRead(n);
}

async function markAllRead(): Promise<void> {
  const unread = notifications.value.filter((n) => !n.isRead);
  if (!unread.length || markingAll.value) return;
  markingAll.value = true;
  unread.forEach((n) => (n.isRead = true));
  // No bulk endpoint — one read per notification.
  const results = await Promise.allSettled(unread.map((n) => markNotificationRead(n.id)));
  const failed = unread.filter((_, i) => results[i].status === 'rejected');
  failed.forEach((n) => (n.isRead = false));
  markingAll.value = false;
  toast.show(failed.length ? `Couldn't mark ${failed.length} as read` : 'All marked as read', failed.length ? 'error' : 'success');
}

async function markRead(n: UserNotification): Promise<void> {
  if (n.isRead) return;
  n.isRead = true;
  try {
    await markNotificationRead(n.id);
  } catch {
    n.isRead = false;
    toast.show("Couldn't mark it as read", 'error');
  }
}

onMounted(load);
</script>

<template>
  <div class="notifications-page">
    <header class="page-header">
      <button type="button" class="header-btn" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div class="header-title">
        <h1>Notifications</h1>
        <span class="header-sub">
          {{ loading ? 'Loading…' : unreadCount ? `${unreadCount} unread` : 'All caught up' }}
        </span>
      </div>
      <button
        v-if="unreadCount"
        type="button"
        class="mark-all"
        :disabled="markingAll"
        @click="markAllRead"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 12.5l4 4 8-9M10 16.5l1 0.5 8-9" />
        </svg>
        {{ markingAll ? 'Marking…' : 'Mark all read' }}
      </button>
      <span v-else class="header-spacer" aria-hidden="true"></span>
    </header>

    <div class="body">
      <div class="tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="filter === 'all'" :class="{ active: filter === 'all' }" @click="filter = 'all'">
          All <span class="tab-count">{{ notifications.length }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="filter === 'unread'" :class="{ active: filter === 'unread' }" @click="filter = 'unread'">
          Unread <span class="tab-count" :class="{ hot: unreadCount }">{{ unreadCount }}</span>
        </button>
      </div>

      <ul v-if="loading" class="list" aria-hidden="true">
        <li v-for="n in 4" :key="n" class="card skeleton">
          <span class="sk sk-icon"></span>
          <span class="sk-lines"><span class="sk sk-line"></span><span class="sk sk-line"></span><span class="sk sk-line short"></span></span>
        </li>
      </ul>

      <StateBlock
        v-else-if="error && !notifications.length"
        tone="error"
        title="Couldn't load notifications"
        :text="error"
        action-label="Try again"
        @action="load"
      />

      <StateBlock
        v-else-if="!visible.length"
        :title="filter === 'unread' ? 'No unread notifications' : 'No notifications yet'"
        :text="filter === 'unread' ? 'You’re all caught up.' : 'Updates about pickups, deliveries and settlements will show here.'"
        :action-label="filter === 'unread' && notifications.length ? 'Show all' : ''"
        action-style="secondary"
        @action="filter = 'all'"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" /><path d="M10 19a2 2 0 0 0 4 0" />
          </svg>
        </template>
      </StateBlock>

      <template v-else>
        <section v-for="group in groups" :key="group.label" class="group">
          <h2 class="group-label">{{ group.label }}</h2>
          <ul class="list">
            <li
              v-for="n in group.items"
              :key="n.id"
              class="card"
              :class="[kindOf(n), { unread: !n.isRead }]"
              role="button"
              tabindex="0"
              @click="open(n)"
              @keydown.enter.self="open(n)"
            >
              <span class="kind-icon" aria-hidden="true">
                <svg v-if="kindOf(n) === 'settlement'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" />
                </svg>
                <svg v-else-if="kindOf(n) === 'pickup'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" />
                </svg>
                <svg v-else-if="kindOf(n) === 'return'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                </svg>
                <svg v-else-if="kindOf(n) === 'delivery'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h11v9H3zM14 9h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" /><path d="M10 19a2 2 0 0 0 4 0" />
                </svg>
              </span>

              <div class="content">
                <div class="top">
                  <span class="title">{{ n.title || 'Notification' }}</span>
                  <span class="time">{{ timeText(n.createdAt) }}</span>
                </div>
                <p class="text" :class="{ clamped: !expanded.has(n.id) }">{{ plainText(n.body) }}</p>
                <span v-if="plainText(n.body).length > LONG_BODY" class="more">
                  {{ expanded.has(n.id) ? 'Show less' : 'Show more' }}
                </span>
              </div>

              <button
                v-if="!n.isRead"
                type="button"
                class="read-btn"
                :aria-label="`Mark ${n.title || 'notification'} as read`"
                title="Mark as read"
                @click.stop="markRead(n)"
              >
                <span class="unread-dot" aria-hidden="true"></span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </button>
            </li>
          </ul>
        </section>

        <button v-if="hasMore && filter === 'all'" type="button" class="load-more" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading…' : `Load older (${total - notifications.length})` }}
        </button>
      </template>
    </div>

    <AppToast :message="toast.message.value" :type="toast.type.value" />
  </div>
</template>

<style scoped>
.notifications-page {
  min-height: 100%;
  background: var(--page);
}

/* ---- header (same pattern as the History pages) ---- */
.page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  min-height: 60px;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid var(--divider);
}
.page-header > * {
  flex-shrink: 0;
}
.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--ink);
  cursor: pointer;
}
.header-btn svg {
  width: 22px;
  height: 22px;
}
.header-title {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 12px;
}
.header-title h1 {
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font: 700 1.1rem var(--sans);
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-sub {
  color: var(--muted);
  font: 500 0.74rem var(--sans);
}
.header-spacer {
  width: 40px;
}
.mark-all {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 11px;
  border: 1px solid var(--green-border);
  border-radius: 999px;
  background: var(--green-tint);
  color: var(--green-strong);
  font: 700 0.74rem var(--sans);
  white-space: nowrap;
  cursor: pointer;
}
.mark-all:disabled {
  opacity: 0.6;
  cursor: progress;
}
.mark-all svg {
  width: 15px;
  height: 15px;
}

.body {
  max-width: 480px;
  margin: 0 auto;
  padding: 14px 16px 32px;
}

/* ---- tabs ---- */
.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: var(--fill-strong);
}
.tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-3);
  font: 700 0.82rem var(--sans);
  cursor: pointer;
}
.tabs button.active {
  background: #fff;
  color: var(--ink);
  box-shadow: 0 1px 4px rgba(17, 24, 39, 0.08);
}
.tab-count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.15);
  font-size: 0.7rem;
}
.tab-count.hot {
  background: var(--green);
  color: #fff;
}

/* ---- groups + cards ---- */
.group {
  margin-top: 16px;
}
.group-label {
  margin: 0 0 8px 4px;
  color: var(--muted);
  font: 700 0.72rem var(--sans);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card {
  --tone: var(--muted);
  --tone-soft: var(--fill);
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 10px 12px 12px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: #fff;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.card:not(.skeleton):active {
  transform: scale(0.99);
}
.card:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 2px;
}
.card.settlement { --tone: var(--green-strong); --tone-soft: var(--green-soft); }
.card.pickup { --tone: var(--blue-strong); --tone-soft: var(--blue-soft); }
.card.return { --tone: var(--orange-strong); --tone-soft: var(--orange-soft); }
.card.delivery { --tone: #6d28d9; --tone-soft: #f1ebfd; }
.card.unread {
  border-color: var(--green-border);
  background: var(--green-tint);
  box-shadow: 0 2px 10px rgba(26, 156, 75, 0.08);
}
.kind-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--tone-soft);
  color: var(--tone);
}
.kind-icon svg {
  width: 20px;
  height: 20px;
}
.content {
  flex: 1;
  min-width: 0;
}
.top {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font: 600 0.9rem var(--sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card.unread .title {
  font-weight: 800;
}
.time {
  flex-shrink: 0;
  color: var(--faint);
  font: 500 0.7rem var(--sans);
}
.card.unread .time {
  color: var(--green-strong);
  font-weight: 700;
}
.text {
  margin: 3px 0 0;
  color: var(--text-3);
  font: 500 0.8rem/1.45 var(--sans);
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.text.clamped {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.more {
  display: inline-block;
  margin-top: 3px;
  color: var(--blue);
  font: 700 0.72rem var(--sans);
}
.unread-dot {
  width: 9px;
  height: 9px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-soft);
}
/* Unread cards: a green dot that turns into a ✓ "Mark as read" button on hover/focus.
   On touch screens (no hover) the ✓ circle is always shown. */
.read-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  margin: -4px -2px 0 0;
  padding: 0;
  border: 1.5px solid var(--green-border);
  border-radius: 50%;
  background: #fff;
  color: var(--green-strong);
  cursor: pointer;
}
.read-btn svg {
  width: 16px;
  height: 16px;
}
.read-btn .unread-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  margin: 0;
}
.read-btn:active {
  background: var(--green);
  color: #fff;
}
@media (hover: hover) {
  .read-btn {
    border-color: transparent;
    background: transparent;
  }
  .read-btn svg {
    opacity: 0;
    transition: opacity 0.12s;
  }
  .read-btn .unread-dot {
    top: 50%;
    right: 50%;
    transform: translate(50%, -50%);
    transition: opacity 0.12s;
  }
  .read-btn:hover,
  .read-btn:focus-visible {
    border-color: var(--green-border);
    background: #fff;
  }
  .read-btn:hover svg,
  .read-btn:focus-visible svg {
    opacity: 1;
  }
  .read-btn:hover .unread-dot,
  .read-btn:focus-visible .unread-dot {
    opacity: 0;
  }
}

/* ---- loading ---- */
.skeleton {
  margin-top: 8px;
  cursor: default;
}
.list:first-of-type .skeleton:first-child {
  margin-top: 16px;
}
.sk {
  display: block;
  background: linear-gradient(90deg, var(--track) 25%, var(--page) 50%, var(--track) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
}
.sk-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
}
.sk-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 2px;
}
.sk-line {
  height: 11px;
  border-radius: 6px;
}
.sk-line.short {
  width: 45%;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.load-more {
  display: block;
  width: 100%;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: #fff;
  color: var(--ink);
  font: 700 0.82rem var(--sans);
  cursor: pointer;
}
.load-more:disabled {
  color: var(--muted);
  cursor: progress;
}
</style>
