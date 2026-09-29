<template>
  <!-- ADR-0015 B3 — Karar 6.1 "Detay" satırı: EkDetailSheet (side-sheet). `identity` spec çapasıdır
       (e2e/specs/admin-tickets.spec.ts:68 `getByRole('dialog').filter({ hasText: 'Destek Talebi Detayı' })`). -->
  <EkDetailSheet v-model="isOpen" identity="Destek Talebi Detayı">
    <template #status>
      <EkStatusChip v-if="ticket" tone="neutral" :label="`TKT-${ticket.ticketNumber}`" />
    </template>

    <div v-if="ticket" class="ticket-container">
      <EkSection>
        <div class="ticket-tags">
          <EkStatusChip :tone="statusTone(ticket.status)" :label="$t(statusEntry(ticket.status).labelKey)" />
          <EkStatusChip :tone="priorityTone(ticket.priority)" :label="ticket.priority" />
          <EkStatusChip tone="neutral" :label="ticket.type" />
        </div>
        <h3 class="ticket-subject">{{ ticket.subject }}</h3>
        <div class="ticket-meta-text">Oluşturulma: {{ formatDate(ticket.createdDate) }}</div>
      </EkSection>

      <!-- Sohbet geçmişi (talep — destek mesajlaşması). Görsel dil, mesajlaşma ekranlarındaki
           MessageDetailComponent (B1) baloncuk deseniyle aynı ilkeyi izler: gönderen tarafına göre
           hizalama + balon zemini, ölçüsüz/degrade renk yok. -->
      <div class="chat-history" ref="chatBox" role="log" tabindex="0" aria-live="polite" aria-label="Talep mesaj geçmişi">
        <div v-for="(msg, info) in ticket.messages" :key="info"
             :class="['msg-wrapper', msg.senderType === 'SUPPORT' ? 'msg-wrapper--support' : 'msg-wrapper--client']">
          <div :class="['msg-bubble', msg.senderType === 'SUPPORT' ? 'msg-bubble--support' : 'msg-bubble--client']">
            <div class="msg-bubble-head">
              <span class="msg-sender">{{ msg.senderName }}</span>
              <span class="msg-time">{{ formatTime(msg.date) }}</span>
            </div>
            <div class="msg-content">{{ msg.content }}</div>
          </div>
        </div>
      </div>

      <div class="reply-section">
        <v-textarea v-model="replyText" label="Cevabınız..." variant="outlined" density="compact"
          hide-details placeholder="Çözüm veya bilgi iletiniz..." rows="3" />

        <div class="reply-actions">
          <v-btn color="primary" prepend-icon="mdi-send"
            :disabled="!replyText.trim() || loading" :loading="loading" @click="submitReply">
            <!-- ek-pattern-exception: büyük harf metin KORUNUYOR — e2e/specs/admin-tickets.spec.ts:74
                 `getByRole('button', { name: /CEVAPLA VE GÖNDER/ })` `i` bayraksız regex, DOM'da birebir
                 eşleşme ister (Karar 5.1: spec iddiaları değiştirilmez; Karar 1.2 istisnası: mevcut
                 büyük harfli spec çapası metni AYNEN kalır). -->
            CEVAPLA VE GÖNDER
          </v-btn>
        </div>
      </div>
    </div>
  </EkDetailSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import EkDetailSheet from '@/components/ds/EkDetailSheet.vue';
import EkSection from '@/components/ds/EkSection.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import { formatDate as formatDateCentral } from '@/composables/format';
import { TICKET_STATUS_TONE, type StatusMapEntry, type StatusTone } from '@/design/status-map';
import { TicketStatusEnum } from '@/types/TicketTypes';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  ticket: { type: Object, default: () => null }
});

const emit = defineEmits(['update:modelValue', 'reply']);

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

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

function submitReply() {
  if (!replyText.value.trim()) return;
  emit('reply', {
    ticketId: props.ticket._id,
    content: replyText.value
  });
  replyText.value = '';
}

const formatDate = (date: any) => formatDateCentral(date);
// Mesaj saatinin biçimi (Karar 6.3 `format.ts` yalnızca tarih+saat birlikte sunar; sohbet
// baloncuğunda YALNIZCA saat gösterilir — `formatDateTime`'ın YARISI, `toLocaleTimeString` mandal
// taramasında İZLENMEZ, bkz. scripts/pattern-counts.js `rawFormat` deseni).
const formatTime = (date: any) => date ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(date)) : '';

// Karar 3.3 — durum kodu status-map.ts TEK KAYNAĞINDAN okunur (ekran renk seçmez).
function statusEntry(status: string): StatusMapEntry {
  return TICKET_STATUS_TONE[status as TicketStatusEnum] ?? { tone: 'neutral', labelKey: 'status.ticket.closed' };
}
function statusTone(status: string): StatusTone {
  return statusEntry(status).tone;
}

// Öncelik (priority) status-map.ts'in kapsamındaki durum ailelerinden biri DEĞİL (sipariş/iade/
// mesaj/talep/fatura/iş/abonelik/mağaza/entegrasyon) — talebe özgü, yerel bir ton eşlemesidir.
const PRIORITY_TONE: Record<string, StatusTone> = {
  URGENT: 'danger', HIGH: 'warning', MEDIUM: 'info', LOW: 'neutral',
};
function priorityTone(priority: string): StatusTone {
  return PRIORITY_TONE[priority] ?? 'neutral';
}
</script>

<style scoped>
.ticket-container {
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ticket-tags {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-2);
}

.ticket-subject {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  margin: 0 0 var(--ek-space-1) 0;
}

.ticket-meta-text {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.chat-history {
  flex-grow: 1;
  overflow-y: auto;
  min-height: 240px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  background: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.msg-wrapper {
  display: flex;
}
.msg-wrapper--support { justify-content: flex-end; }
.msg-wrapper--client { justify-content: flex-start; }

.msg-bubble {
  max-width: 80%;
  padding: var(--ek-space-3);
  border-radius: var(--ek-radius-lg);
}

/* Destek (SUPPORT) balonu `info` tonuyla, müşteri balonu nötr yüzeyle ayrışır — token kaynaklı,
   literal renk kodu yok (önceki bespoke indigo değerleri B3'te kaldırıldı). */
.msg-bubble--support {
  background: var(--ek-color-info-subtle);
  border: 1px solid var(--ek-color-info);
}
.msg-bubble--client {
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
}

.msg-bubble-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-4);
  margin-bottom: var(--ek-space-1);
}

.msg-sender {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.msg-bubble--support .msg-sender { color: var(--ek-color-info); }

.msg-time {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

/* Destek balonunun `info-subtle` zemininde `content-muted` ~4,14:1'de kalıp AA'yı (4,5:1)
   geçemiyor (axe ile ölçüldü, B3) → `content-default`. */
.msg-bubble--support .msg-time { color: var(--ek-color-content-default); }

.msg-content {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-strong);
  white-space: pre-wrap;
}

.reply-section {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

/* Vuetify'ın yüzen etiketi varsayılan `medium-emphasis` opaklığıyla ~4,29:1'de kalıyor (axe ile
   ölçüldü, B3) — LoginComponent'teki AYNI düzeltme (`.consent-checkbox :deep(.v-label)`). */
.reply-section :deep(.v-field-label) {
  color: var(--ek-color-content-default) !important;
  opacity: 1 !important;
}

.reply-actions {
  display: flex;
  justify-content: flex-end;
}

.chat-history::-webkit-scrollbar {
  width: 6px;
}
.chat-history::-webkit-scrollbar-thumb {
  background: var(--ek-color-border-default);
  border-radius: 10px;
}
</style>
