<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { deleteUserNotification, getUserNotifications, type UserNotification } from '../api/notifications';

const router = useRouter();
const notifications = ref<UserNotification[]>([]);
const loading = ref(true);
const error = ref('');
const deletingId = ref<number | null>(null);

function formatDate(value?: string): string {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { results } = await getUserNotifications();
    notifications.value = results;
  } catch (err: any) {
    error.value = err.message ?? 'Failed to load notifications';
  } finally {
    loading.value = false;
  }
}

async function onDelete(id: number) {
  deletingId.value = id;
  try {
    await deleteUserNotification(id);
    notifications.value = notifications.value.filter((item) => item.id !== id);
  } catch (err: any) {
    error.value = err.message ?? 'Failed to delete notification';
  } finally {
    deletingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="notifications-page">
    <header class="page-header">
      <button type="button" class="back" aria-label="Back" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h1>Notifications</h1>
    </header>

    <p v-if="loading" class="hint">Loading...</p>
    <p v-else-if="error" class="hint error">{{ error }}</p>
    <p v-else-if="!notifications.length" class="hint">No notifications yet.</p>

    <ul v-else class="notification-list">
      <li v-for="item in notifications" :key="item.id" class="notification-card" :class="{ unread: !item.isRead }">
        <div class="notification-body">
          <div class="notification-top">
            <span class="title">{{ item.title }}</span>
            <span v-if="!item.isRead" class="unread-dot" aria-hidden="true"></span>
          </div>
          <p class="text">{{ item.body }}</p>
          <span class="date">{{ formatDate(item.createdAt) }}</span>
        </div>
        <button
          type="button"
          class="delete-btn"
          aria-label="Delete notification"
          :disabled="deletingId === item.id"
          @click="onDelete(item.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
          </svg>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.notifications-page {
  padding-bottom: 24px;
}
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid var(--line);
}
.back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--wash);
  color: var(--ink);
  cursor: pointer;
}
.back svg {
  width: 18px;
  height: 18px;
}
.page-header h1 {
  margin: 0;
  font: 700 1.15rem var(--heading);
  color: var(--ink);
}
.hint {
  padding: 40px 20px;
  text-align: center;
  color: var(--muted);
}
.hint.error {
  color: #e33;
}
.notification-list {
  list-style: none;
  margin: 0;
  padding: 32px 16px 40px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.notification-card {
  display: flex;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
}
.notification-card.unread {
  background: var(--wash);
  border-color: var(--green);
}
.notification-body {
  flex: 1;
  min-width: 0;
}
.notification-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title {
  font-weight: 700;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unread-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
}
.text {
  margin: 4px 0 6px;
  color: var(--ink);
  font-size: 0.85rem;
  line-height: 1.4;
}
.date {
  color: var(--muted);
  font-size: 0.75rem;
}
.delete-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.delete-btn svg {
  width: 16px;
  height: 16px;
}
</style>
