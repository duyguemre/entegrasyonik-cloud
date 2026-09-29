<template>
  <ActionDialogComponent :model-value="modelValue" @update:model-value="val => $emit('update:modelValue', val)"
    :title="`DESTEK TALEBİ: ${ticket?.ticketNumber || ''}`" :subtitle="ticket?.subject"
    icon="mdi-message-text-clock-outline" color="passiveColor" attach="ticketListView" cancel-text="Kapat"
    show-confirm="false" maxWidth="1000px" @cancel="$emit('update:modelValue', false)" :showFooter="false">
    <div v-if="ticket" class="ticket-detail-container d-flex flex-column h-100">
      <!-- Ticket Meta Info Header -->
      <div class="ticket-meta-header pa-4 border-bottom-subtle bg-slate-50 d-flex flex-wrap align-center"
        style="gap: 16px;">
        <div class="meta-item">
          <span class="meta-label">Durum</span>
          <v-chip size="small" :color="getStatusColor(ticket.status)" variant="flat"
            class="text-white font-weight-black">
            {{ translateStatus(ticket.status) }}
          </v-chip>
        </div>
        <div class="meta-item">
          <span class="meta-label">Öncelik</span>
          <v-chip size="small" :color="getPriorityColor(ticket.priority)" variant="tonal" class="font-weight-black">
            {{ translatePriority(ticket.priority) }}
          </v-chip>
        </div>
        <div class="meta-item">
          <span class="meta-label">Tip</span>
          <span class="meta-value">{{ translateType(ticket.type) }}</span>
        </div>
        <div class="meta-item ml-auto">
          <span class="meta-label">Oluşturma</span>
          <span class="meta-value">{{ formatDate(ticket.createdDate) }}</span>
        </div>
      </div>

      <!-- Messages Area -->
      <div ref="messageContainer" class="messages-scroll-area flex-grow-1 pa-4 overflow-y-auto bg-slate-50"
        style="max-height: 500px;">
        <div v-for="(msg, idx) in ticket.messages" :key="idx" class="message-wrapper d-flex mb-4"
          :class="msg.senderType === 'CLIENT' ? 'justify-end' : 'justify-start'">

          <div class="message-bubble-container d-flex flex-column"
            :style="msg.senderType === 'CLIENT' ? 'align-items: flex-end' : 'align-items: flex-start'">
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
      <div v-if="ticket.status !== 'CLOSED'" class="reply-area pa-4 border-top-subtle bg-white">
        <v-textarea v-model="replyMessage" placeholder="Yanıtınızı buraya yazın..." variant="outlined" density="compact"
          rows="3" hide-details class="customTextField mb-3" @keyup.ctrl.enter="handleReply"></v-textarea>
        <div class="d-flex justify-end align-center">
          <span class="text-micro text-passiveColor mr-4">Ctrl + Enter ile gönder</span>
          <v-btn color="info" class="premium-save-btn text-white" variant="flat" :loading="replyLoading"
            :disabled="!replyMessage.trim()" @click="handleReply">
            <v-icon size="18" class="mr-2">mdi-send</v-icon> Gönder
          </v-btn>
        </div>
      </div>
      <div v-else class="pa-6 bg-slate-100 text-center color-slate-500 font-weight-bold">
        <v-icon class="mr-2">mdi-lock-outline</v-icon>
        Bu destek talebi kapatılmıştır. Yeni bir mesaj gönderilemez.
      </div>
    </div>
  </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import {
  TicketStatusEnum, TicketPriorityEnum, TicketTypeEnum,
  TICKET_STATUS_LABELS, TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  TICKET_TYPE_LABELS
} from '@/types/TicketTypes';

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
const getStatusColor = (s: any) => TICKET_STATUS_COLORS[s as TicketStatusEnum] || 'passiveColor';
const translatePriority = (p: any) => TICKET_PRIORITY_LABELS[p as TicketPriorityEnum] || p;
const getPriorityColor = (p: any) => TICKET_PRIORITY_COLORS[p as TicketPriorityEnum] || 'passiveColor';
const translateType = (t: any) => TICKET_TYPE_LABELS[t as TicketTypeEnum] || t;
</script>

<style scoped>
.ticket-detail-container {
  min-height: 400px;
}

.messages-scroll-area {
  scrollbar-width: thin;
}

.meta-item {
  display: flex;
  flex-direction: column;
}

.meta-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 2px;
}

.meta-value {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
}

.message-bubble {
  max-width: 80%;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.client-bubble {
  background: #0ea5e9;
  color: white;
  border-bottom-right-radius: 2px;
}

.support-bubble {
  background: white;
  color: #1e293b;
  border-bottom-left-radius: 2px;
  border: 1px solid #e2e8f0;
}

.sender-name {
  font-size: 11px;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
}

.message-time {
  font-size: 10px;
  color: #94a3b8;
}

.bg-slate-50 {
  background-color: #f8fafc !important;
}

.bg-slate-100 {
  background-color: #f1f5f9 !important;
}

.border-bottom-subtle {
  border-bottom: 1px solid #e2e8f0;
}

.border-top-subtle {
  border-top: 1px solid #e2e8f0;
}
</style>
