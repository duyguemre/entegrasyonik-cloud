<template>
  <ActionDialogComponent :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)"
    @cancel="close" @close="close" title="Destek Talebi Detayı" :subtitle="ticket ? `TKT-${ticket.ticketNumber}` : 'Detay'"
    icon="mdi-face-agent" :color="getStatusColor(ticket?.status)" cancelText="Kapat" maxWidth="800px" :showFooter="false">

    <div v-if="ticket" class="ticket-container">
      <!-- Talep başlığı -->
      <div class="ticket-header">
        <div class="ticket-chips">
          <EkStatusChip :tone="statusTone(ticket.status)" :label="statusLabel(ticket.status)" />
          <EkStatusChip :tone="priorityTone(ticket.priority)" :label="ticket.priority" />
          <EkStatusChip tone="neutral" :label="ticket.type" />
        </div>
        <h3 class="ticket-subject">{{ ticket.subject }}</h3>
        <div class="ticket-meta">Oluşturulma: {{ formatDate(ticket.createdDate) }}</div>
      </div>

      <!-- Mesaj geçmişi -->
      <div class="chat-history" ref="chatBox" role="log" tabindex="0" aria-live="polite"
        aria-label="Talep mesaj geçmişi">
        <div v-for="(msg, info) in ticket.messages" :key="info"
          :class="['msg-wrapper', msg.senderType === 'SUPPORT' ? 'msg-wrapper--support' : 'msg-wrapper--customer']">
          <div :class="['msg-bubble', msg.senderType === 'SUPPORT' ? 'msg-bubble--support' : 'msg-bubble--customer']">
            <div class="msg-head">
              <span class="msg-sender">{{ msg.senderName }}</span>
              <span class="msg-time">{{ formatTime(msg.date) }}</span>
            </div>
            <div class="msg-content">{{ msg.content }}</div>
          </div>
        </div>
      </div>

      <!-- Yanıt alanı -->
      <div class="reply-section">
        <v-textarea v-model="replyText" label="Cevabınız..." variant="outlined" density="compact"
          hide-details class="customTextField" placeholder="Çözüm veya bilgi iletiniz..."
          rows="3"></v-textarea>

        <div class="reply-actions">
          <v-btn flat color="primary" prepend-icon="mdi-send-outline" class="px-6"
            :disabled="!replyText.trim() || loading" :loading="loading" @click="submitReply">
            CEVAPLA VE GÖNDER
          </v-btn>
        </div>
      </div>
    </div>
  </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import { EkStatusChip } from '@entegrasyonik/ui/components';
import { formatDate, formatDateTime } from '@entegrasyonik/ui/format';
import type { StatusTone } from '@/design/status-map';
import { TICKET_STATUS_COLORS, TICKET_STATUS_LABELS, type TicketStatusEnum } from '@/types/TicketTypes';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  ticket: { type: Object, default: () => null }
});

const emit = defineEmits(['update:modelValue', 'reply']);

const replyText = ref('');
const loading = ref(false);
const chatBox = ref<any>(null);

watch(() => props.modelValue, (val) => {
  if (val) {
    replyText.value = '';
    scrollToBottom();
  }
});

function scrollToBottom() {
  nextTick(() => {
    if (chatBox.value) {
      chatBox.value.scrollTop = chatBox.value.scrollHeight;
    }
  });
}

function close() {
  emit('update:modelValue', false);
}

function submitReply() {
  if (!replyText.value.trim()) return;
  emit('reply', {
    ticketId: props.ticket._id,
    content: replyText.value
  });
  replyText.value = '';
}

// Saat: mesaj balonunda yalnızca gün içi zaman yeterli; tarih+saat biçimlendiricisinden saat kısmı alınır.
const formatTime = (date: any) => (date ? formatDateTime(date).split(' ')[1] ?? '' : '');

// Aşama 4: durum adı/tonu tek kaynak (TicketTypes) — liste ve sohbet aynı dili konuşur.
const statusLabel = (status: string) => TICKET_STATUS_LABELS[status as TicketStatusEnum] ?? status;

const statusTone = (status: string): StatusTone =>
  (TICKET_STATUS_COLORS[status as TicketStatusEnum] as StatusTone | undefined) ?? 'info';

const priorityTone = (priority: string): StatusTone => {
  switch (priority) {
    case 'URGENT': return 'danger';
    case 'HIGH': return 'warning';
    case 'LOW': return 'neutral';
    default: return 'info';
  }
};

// Diyalog başlık rengi (ActionDialogComponent `color` prop'u Vuetify tema adı bekler).
const getStatusColor = (status: string) => {
  switch (status) {
    case 'OPEN': return 'error';
    case 'IN_PROGRESS': return 'warning';
    case 'RESOLVED': return 'success';
    case 'CLOSED': return 'neutral';
    default: return 'info';
  }
};
</script>

<style scoped lang="scss">
.ticket-container {
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4);
}

.ticket-header {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding-bottom: var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ticket-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

.ticket-subject {
  margin: 0;
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ticket-meta {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.chat-history {
  flex-grow: 1;
  overflow-y: auto;
  min-height: 300px;
  max-height: 450px;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  background-color: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.msg-wrapper {
  display: flex;

  &--support { justify-content: flex-end; }
  &--customer { justify-content: flex-start; }
}

.msg-bubble {
  max-width: 80%;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);

  &--customer { background-color: var(--ek-color-surface); }
  &--support { background-color: var(--ek-color-info-subtle); }
}

.msg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-4);
  margin-bottom: var(--ek-space-1);
  font-size: var(--ek-font-size-xs);
}

.msg-sender {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-default);
}

// Yalnızca METİN: `content-subtle` AA'yı geçemez → `content-default` (info-subtle zeminde de okunur).
.msg-time {
  color: var(--ek-color-content-default);
}

.msg-content {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-strong);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.reply-section {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.reply-section :deep(.v-field-label) {
  color: var(--ek-color-content-muted) !important;
  opacity: 1 !important;
}

.reply-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ek-space-2);
}

.chat-history::-webkit-scrollbar {
  width: 6px;
}
.chat-history::-webkit-scrollbar-thumb {
  background: var(--ek-color-border-default);
  border-radius: var(--ek-radius-full);
}
</style>
