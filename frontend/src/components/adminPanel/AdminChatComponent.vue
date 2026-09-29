<template>
  <ActionDialogComponent :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)"
    @cancel="close" @close="close" title="Destek Talebi Detayı" :subtitle="ticket ? `TKT-${ticket.ticketNumber}` : 'Detay'"
    icon="mdi-face-agent" :color="getStatusColor(ticket?.status)" cancelText="Kapat" maxWidth="800px" :showFooter="false">

    <div v-if="ticket" class="pa-4 ticket-container">
      <!-- Ticket Header Info -->
      <div class="d-flex align-center flex-wrap gap-4 mb-6 border-b pb-4">
        <div class="flex-grow-1">
          <div class="d-flex align-center gap-2 mb-2">
            <v-chip size="small" :color="getStatusColor(ticket.status)" variant="flat" class="font-weight-black">
              {{ ticket.status }}
            </v-chip>
            <v-chip size="small" :color="getPriorityColor(ticket.priority)" variant="tonal" class="font-weight-black">
              {{ ticket.priority }}
            </v-chip>
            <v-chip size="small" color="slate-100" class="font-weight-black color-slate-700">
              {{ ticket.type }}
            </v-chip>
          </div>
          <h3 class="text-h6 font-weight-black color-slate-900">{{ ticket.subject }}</h3>
          <div class="text-caption font-weight-medium color-slate-500">
            Oluşturulma: {{ formatDate(ticket.createdDate) }}
          </div>
        </div>
      </div>

      <!-- Chat History -->
      <div class="chat-history mb-6 pa-2 bg-slate-50 rounded-lg border" ref="chatBox" role="log" tabindex="0"
        aria-live="polite" aria-label="Talep mesaj geçmişi">
        <div v-for="(msg, info) in ticket.messages" :key="info" 
             :class="['msg-wrapper d-flex mb-4', msg.senderType === 'SUPPORT' ? 'justify-end' : 'justify-start']">
          
          <div :class="['msg-bubble pa-3 rounded-lg', msg.senderType === 'SUPPORT' ? 'bg-indigo-lighten-5 border-indigo-soft' : 'bg-white border']">
            <div class="d-flex align-center justify-space-between gap-4 mb-1">
              <span class="text-micro font-weight-black" :class="msg.senderType === 'SUPPORT' ? 'text-indigo' : 'text-slate-600'">
                {{ msg.senderName }}
              </span>
              <span class="text-micro color-slate-400">{{ formatTime(msg.date) }}</span>
            </div>
            <div class="text-body-2 color-slate-900">{{ msg.content }}</div>
          </div>
        </div>
      </div>

      <!-- Reply Section -->
      <div class="reply-section">
        <v-textarea v-model="replyText" label="Cevabınız..." variant="outlined" density="compact"
          hide-details class="customTextField mb-4" placeholder="Çözüm veya bilgi iletiniz..." 
          rows="3" bg-color="white"></v-textarea>

        <div class="d-flex justify-end gap-2">
          <v-btn flat color="primary" prepend-icon="mdi-send" class="premium-save-btn px-6 font-weight-black"
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

const formatDate = (date: any) => date ? new Date(date).toLocaleDateString('tr-TR') : '-';
const formatTime = (date: any) => date ? new Date(date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';

const getStatusColor = (status: string) => {
  switch (status) {
    case 'OPEN': return 'error';
    case 'IN_PROGRESS': return 'warning';
    case 'RESOLVED': return 'success';
    case 'CLOSED': return 'passiveColor';
    default: return 'info';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'URGENT': return 'error';
    case 'HIGH': return 'orange';
    case 'MEDIUM': return 'info';
    case 'LOW': return 'slate-400';
    default: return 'info';
  }
};
</script>

<style scoped lang="scss">
.ticket-container {
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.chat-history {
  flex-grow: 1;
  overflow-y: auto;
  min-height: 300px;
  max-height: 450px;
  display: flex;
  flex-direction: column;
}

.msg-bubble {
  max-width: 80%;
  box-shadow: var(--ek-shadow-sm);
  position: relative;
}

.bg-slate-50 { background-color: var(--ek-color-surface-muted) !important; }
/* Destek (SUPPORT) balonu: indigo-50/indigo-200 tonları — token setinde TAM eşleşen karşılığı yok
   (ADR-0011 Açık Soru 4: yakın-ama-farklı renk ZORLANMADI); canlı değerler korundu. */
.bg-indigo-lighten-5 { background-color: #eef2ff !important; }
.border-indigo-soft { border: 1px solid #c7d2fe !important; }
.color-slate-900 { color: var(--ek-color-content-strong); }
.color-slate-700 { color: var(--ek-color-content-default); }
.color-slate-500 { color: var(--ek-color-content-muted); }
/* Yalnızca METİN (mesaj zamanı) için kullanılıyor: `content-subtle` beyazda 2,56:1 ile AA'yı
   geçemez ve token belgesi metin için kullanımı yasaklar → `content-muted` (4,76:1). */
.color-slate-400 { color: var(--ek-color-content-muted); }
/* Destek balonunun indigo zemininde `content-muted` ~4,25:1'de kalıp AA'yı geçemiyor → `content-default`. */
.bg-indigo-lighten-5 .color-slate-400 { color: var(--ek-color-content-default); }
.text-micro { font-size: var(--ek-font-size-xs); }

.gap-2 { gap: var(--ek-space-2); }
.gap-4 { gap: var(--ek-space-4); }

.chat-history::-webkit-scrollbar {
  width: 6px;
}
.chat-history::-webkit-scrollbar-thumb {
  background: var(--ek-color-border-default);
  border-radius: 10px;
}
</style>
