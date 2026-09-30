<!--
  frontend/src/components/ticket/TicketDetailComponent.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN (bkz. e2e/specs/support-tickets.spec.ts). API sözleşmesi/davranış
  DEĞİŞMEDİ: `@reply` payload'ı, mesaj listesi kaynağı AYNEN korundu. Durum/öncelik rozetleri çıplak
  `v-chip` yerine `EkStatusChip`'e taşındı — durum tonu paylaşılan `design/status-map.ts`
  `TICKET_STATUS_TONE`'dan (A2'de zaten tanımlı), öncelik tonu bu görevin YEREL
  `composables/ticketPriorityTone.ts` dosyasından gelir (status-map.ts A-owned, dokunulmadı).
-->
<template>
  <ActionDialogComponent :model-value="modelValue" @update:model-value="val => $emit('update:modelValue', val)"
    :title="`DESTEK TALEBİ: ${ticket?.ticketNumber || ''}`" :subtitle="ticket?.subject"
    icon="mdi-message-text-clock-outline" color="content-muted" attach="ticketListView" cancel-text="Kapat"
    show-confirm="false" maxWidth="1000px" @cancel="$emit('update:modelValue', false)" :showFooter="false">
    <div v-if="ticket" class="ticket-detail-container d-flex flex-column h-100">
      <!-- Ticket Meta Info Header -->
      <div class="ek-ticket-meta d-flex flex-wrap align-center">
        <div class="meta-item">
          <span class="meta-label">Durum</span>
          <EkStatusChip :tone="statusTone(ticket.status)" :label="translateStatus(ticket.status)" />
        </div>
        <div class="meta-item">
          <span class="meta-label">Öncelik</span>
          <EkStatusChip :tone="priorityTone(ticket.priority)" :label="translatePriority(ticket.priority)" />
        </div>
        <div class="meta-item">
          <span class="meta-label">Tip</span>
          <span class="meta-value">{{ translateType(ticket.type) }}</span>
        </div>
        <div class="meta-item ml-auto">
          <span class="meta-label">Oluşturma</span>
          <span class="meta-value ek-num">{{ formatDate(ticket.createdDate) }}</span>
        </div>
      </div>

      <!-- Messages Area -->
      <div ref="messageContainer" class="ek-ticket-messages flex-grow-1 pa-4 overflow-y-auto">
        <div v-for="(msg, idx) in ticket.messages" :key="idx" class="message-wrapper d-flex mb-4"
          :class="msg.senderType === 'CLIENT' ? 'justify-end' : 'justify-start'">

          <div class="message-bubble-container d-flex flex-column"
            :class="msg.senderType === 'CLIENT' ? 'align-end' : 'align-start'">
            <div class="d-flex align-center mb-1">
              <span v-if="msg.senderType === 'SUPPORT'" class="sender-name mr-2">{{ msg.senderName }} (Destek)</span>
              <span class="message-time">{{ formatDate(msg.date) }}</span>
              <span v-if="msg.senderType === 'CLIENT'" class="sender-name ml-2">{{ msg.senderName }} (Siz)</span>
            </div>

            <div class="message-bubble pa-3" :class="msg.senderType === 'CLIENT' ? 'client-bubble' : 'support-bubble'">
              {{ msg.content }}
            </div>
          </div>
        </div>
      </div>

      <!-- Reply Area -->
      <div v-if="ticket.status !== 'CLOSED'" class="ek-ticket-reply pa-4">
        <v-textarea v-model="replyMessage" placeholder="Yanıtınızı buraya yazın..." variant="outlined" density="compact"
          rows="3" hide-details class="mb-3" @keyup.ctrl.enter="handleReply"></v-textarea>
        <div class="d-flex justify-end align-center">
          <span class="ek-ticket-reply__hint mr-4">Ctrl + Enter ile gönder</span>
          <v-btn color="primary" :loading="replyLoading" :disabled="!replyMessage.trim()" @click="handleReply">
            <v-icon size="18" class="mr-2">mdi-send</v-icon> Gönder
          </v-btn>
        </div>
      </div>
      <div v-else class="ek-ticket-closed pa-6 text-center">
        <v-icon class="mr-2">mdi-lock-outline</v-icon>
        Bu destek talebi kapatılmıştır. Yeni bir mesaj gönderilemez.
      </div>
    </div>
  </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import {
  TicketStatusEnum, TicketPriorityEnum, TicketTypeEnum,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_TYPE_LABELS
} from '@/types/TicketTypes';
import { TICKET_STATUS_TONE } from '@/design/status-map';
import { TICKET_PRIORITY_TONE } from './composables/ticketPriorityTone';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  ticket: { type: Object, default: null }
});

const emit = defineEmits(['update:modelValue', 'reply']);

const replyMessage = ref('');
const replyLoading = ref(false);
const messageContainer = ref<any>(null);

const scrollToBottom = () => {
  nextTick(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
    }
  });
};

const handleReply = async () => {
  if (!replyMessage.value.trim()) return;
  replyLoading.value = true;
  emit('reply', {
    ticketId: props.ticket._id,
    content: replyMessage.value
  });
  replyMessage.value = '';
  replyLoading.value = false;
  scrollToBottom();
};

const formatDate = (date: any) => date ? new Date(date).toLocaleString('tr-TR') : '-';
const translateStatus = (s: any) => TICKET_STATUS_LABELS[s as TicketStatusEnum] || s;
const statusTone = (s: any) => TICKET_STATUS_TONE[s as TicketStatusEnum]?.tone || 'neutral';
const translatePriority = (p: any) => TICKET_PRIORITY_LABELS[p as TicketPriorityEnum] || p;
const priorityTone = (p: any) => TICKET_PRIORITY_TONE[p as TicketPriorityEnum] || 'neutral';
const translateType = (t: any) => TICKET_TYPE_LABELS[t as TicketTypeEnum] || t;
</script>

<style scoped>
.ticket-detail-container {
  min-height: 400px;
}

.ek-ticket-meta {
  gap: var(--ek-space-4);
  padding: var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}

.ek-ticket-messages {
  scrollbar-width: thin;
  max-height: 500px;
  background: var(--ek-color-surface-muted);
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.meta-label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ek-color-content-muted);
}

.meta-value {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.message-bubble {
  max-width: 80%;
  border-radius: var(--ek-radius-lg);
  font-size: var(--ek-font-size-md);
  line-height: 1.5;
  white-space: pre-wrap;
}

.client-bubble {
  background: var(--ek-color-primary);
  color: var(--ek-color-background);
  border-bottom-right-radius: 2px;
}

.support-bubble {
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  border-bottom-left-radius: 2px;
  border: 1px solid var(--ek-color-border-default);
}

.sender-name {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
}

.message-time {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-subtle);
}

.ek-ticket-reply {
  border-top: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
}

.ek-ticket-reply__hint {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.ek-ticket-closed {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-semibold);
}
</style>
