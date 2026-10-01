<!--
  frontend/src/components/ticket/TicketDetailComponent.vue

  A6a — talep ayrıntısı: sohbet benzeri zaman çizgisi + sabit yanıt kutusu.
  Kullanıcının mesajları SAĞDA, destek ekibinin SOLDA; gönderen + zaman damgası (format.ts). Zaman çizgisine yalnız
  KESİN bilinen olaylar girer (açılış, kapanış) — backend durum geçmişi tutmaz (bkz. ticketRules.buildTimeline).
  Yanıt gövdesi DEĞİŞMEDİ: `TicketService/sendTicketMessage` `{ ticketId, content, senderType: 'CLIENT' }`.
  Veri kaynağı: liste satırı nesnesi (ayrı detay isteği YOK); `ticket` yokken iskelet gösterilir.
-->
<template>
  <!-- FR3-13: destek talebi de ortak kayıt detayı deseninde (EkRecordSheet): özet kartı üstte, yazışma başlıklı bölüm
       kartında, yanıt alanı sabit alt çubukta. -->
  <EkRecordSheet
    :model-value="modelValue"
    kind="Destek talebi"
    :identity="ticket?.ticketNumber || 'Destek talebi'"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <template #status>
      <EkStatusChip v-if="ticket" :tone="statusTone(ticket.status)" :label="translateStatus(ticket.status)" />
    </template>

    <template v-if="ticket" #summary>
      <EkRecordSummary
        icon="mdi-lifebuoy"
        :kind="translateType(ticket.type)"
        :title="ticket.subject || 'Konu belirtilmedi'"
        :facts="summaryFacts"
        label="Destek talebi özeti"
      >
        <template #status>
          <EkStatusChip :tone="priorityTone(ticket.priority)" :label="`${translatePriority(ticket.priority)} öncelik`" />
        </template>
      </EkRecordSummary>
    </template>

    <EkSkeleton v-if="!ticket" type="detail" class="tk-loading" />

    <EkDetailPanel v-else title="Yazışma" icon="mdi-forum-outline" :description="threadText" flush>
      <div ref="scroller" class="tk-scroll" role="log" aria-label="Yazışma geçmişi" tabindex="0">
        <ol class="tk-timeline">
          <template v-for="entry in entries" :key="entry.key">
            <li v-if="entry.kind === 'day'" class="tk-day">
              <time :datetime="isoDay(entry.date)">{{ formatDate(entry.date) }}</time>
            </li>
            <li v-else-if="entry.kind === 'event'" class="tk-event">
              <v-icon :icon="entry.icon" class="tk-event__icon" aria-hidden="true" />
              <span class="tk-event__text">{{ entry.text }}</span>
              <time v-if="entry.date" class="tk-event__time ek-num" :datetime="isoDay(entry.date)" :aria-label="formatDateTime(entry.date)">{{ timeOf(entry.date) }}</time>
            </li>
            <li v-else class="tk-msg" :class="entry.mine ? 'tk-msg--mine' : 'tk-msg--support'">
              <div class="tk-msg__meta">
                <span class="tk-msg__sender">{{ entry.sender }}<span class="tk-msg__role"> · {{ entry.mine ? 'Siz' : 'Destek' }}</span></span>
                <time class="tk-msg__time ek-num" :datetime="isoDay(entry.date)" :aria-label="formatDateTime(entry.date)">{{ timeOf(entry.date) }}</time>
              </div>
              <div class="tk-msg__bubble">{{ entry.content }}</div>
            </li>
          </template>
          <li v-if="!hasMessages" class="tk-empty">Bu talepte henüz mesaj yok.</li>
        </ol>
      </div>
    </EkDetailPanel>

    <template v-if="ticket" #footer>
      <div v-if="ticket.status !== TicketStatusEnum.CLOSED" class="tk-reply">
        <div v-if="reply.state.value.error" class="tk-alert" role="alert">
          <v-icon icon="mdi-alert-circle-outline" class="tk-alert__icon" aria-hidden="true" />
          <div>
            <p class="tk-alert__title">{{ reply.state.value.error.title }}</p>
            <p class="tk-alert__hint">{{ reply.state.value.error.hint }}</p>
          </div>
        </div>
        <v-textarea
          ref="replyField"
          v-model="reply.draft.value"
          aria-label="Yanıtınız"
          placeholder="Yanıtınızı buraya yazın..."
          rows="2"
          auto-grow
          max-rows="6"
          hide-details
          :disabled="reply.busy.value"
          @keydown="onReplyKey"
        />
        <div class="tk-reply__bar">
          <span class="tk-hint"><EkKbd :keys="['Ctrl', 'Enter']" /> ile gönder</span>
          <span class="tk-counter" :class="`tk-counter--${reply.counter.value.level}`" aria-hidden="true">{{ reply.counter.value.label }}</span>
          <EkButton tone="primary" icon="mdi-send-outline" :loading="reply.busy.value" :disabled="!reply.canSend.value" @click="handleReply">Gönder</EkButton>
        </div>
        <div class="ek-sr-only" aria-live="polite" aria-atomic="true">{{ reply.liveMessage.value }}</div>
      </div>
      <div v-else class="tk-closed">
        <v-icon icon="mdi-lock-outline" class="tk-closed__icon" aria-hidden="true" />
        <p>Bu destek talebi kapatılmıştır. Yeni bir mesaj gönderilemez — başka bir konu için yeni bir destek talebi açabilirsiniz.</p>
      </div>
    </template>
  </EkRecordSheet>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { EkRecordSheet, EkRecordSummary, type EkSummaryFact, EkDetailPanel, EkButton, EkKbd, EkSkeleton, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatDate, formatDateTime } from '@entegrasyonik/ui/format'
import {
  TicketStatusEnum, TicketPriorityEnum, TicketTypeEnum,
  TICKET_STATUS_LABELS, TICKET_PRIORITY_LABELS, TICKET_TYPE_LABELS,
} from '@/types/TicketTypes'
import { TICKET_STATUS_TONE } from '@/design/status-map'
import { TICKET_PRIORITY_TONE } from './composables/ticketPriorityTone'
import { TICKET_TYPE_META, buildTimeline, isSubmitShortcut, withDaySeparators } from './composables/ticketRules'
import { useTicketReply } from './composables/useTicketReply'
import type { TicketActionResult } from './composables/useTicketActions'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  ticket: { type: Object, default: null },
  /** Yanıtı gönderir ve sınıflanmış sonucu döner; başarıda çağıran talep nesnesini günceller. */
  sendReply: { type: Function as unknown as () => (payload: { ticketId: string; content: string }) => Promise<TicketActionResult>, required: true },
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const scroller = ref<HTMLElement | null>(null)
const replyField = ref<any>(null)

const reply = useTicketReply((content) => props.sendReply({ ticketId: props.ticket?._id, content }))

const entries = computed(() => withDaySeparators(buildTimeline(props.ticket)))
const hasMessages = computed(() => (props.ticket?.messages?.length ?? 0) > 0)

function scrollToBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      // FR3-13: kaydırma kabı kayıt diyaloğunun gövdesi (yazışma kartı onun içinde).
      const el = (scroller.value?.closest('.ek-record-sheet__body') as HTMLElement | null) ?? scroller.value
      if (el) el.scrollTop = el.scrollHeight
    })
  })
}

async function handleReply() {
  if (await reply.submit()) {
    scrollToBottom()
    await nextTick()
    replyField.value?.focus?.()
  }
}

function onReplyKey(e: KeyboardEvent) {
  if (isSubmitShortcut(e)) {
    e.preventDefault()
    handleReply()
  }
}

watch(() => [props.modelValue, props.ticket?._id, props.ticket?.messages?.length], () => {
  if (props.modelValue) scrollToBottom()
}, { flush: 'post' })

// Başka talebe geçilince taslak ve hata sıfırlanır.
watch(() => props.ticket?._id, () => reply.reset())

/** Gün ayracının altında yalnız saat (tam tarih-saat okuyucuya `aria-label` ile verilir). */
const timeOf = (d: unknown) => formatDateTime(d as string).split(' ')[1] ?? '—'
const isoDay = (d: unknown) => {
  const t = d ? new Date(d as string).getTime() : NaN
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}
const translateStatus = (s: any) => TICKET_STATUS_LABELS[s as TicketStatusEnum] || s
const statusTone = (s: any) => TICKET_STATUS_TONE[s as TicketStatusEnum]?.tone || 'neutral'
const translatePriority = (p: any) => TICKET_PRIORITY_LABELS[p as TicketPriorityEnum] || p
const priorityTone = (p: any) => TICKET_PRIORITY_TONE[p as TicketPriorityEnum] || 'neutral'
const translateType = (t: any) => TICKET_TYPE_LABELS[t as TicketTypeEnum] || t
const messageCount = computed(() => props.ticket?.messages?.length ?? 0)
const threadText = computed(() => (messageCount.value ? `${messageCount.value} mesaj · eskiden yeniye` : 'Henüz mesaj yok'))
const summaryFacts = computed<EkSummaryFact[]>(() => {
  const t = props.ticket
  if (!t) return []
  const facts: EkSummaryFact[] = [
    { label: 'Talep no', value: t.ticketNumber, numeric: true },
    { label: 'Açılış', value: formatDateTime(t.createdDate), numeric: true },
  ]
  if (t.lastMessageAt) facts.push({ label: 'Son mesaj', value: formatDateTime(t.lastMessageAt), numeric: true })
  return facts
})
</script>

<style scoped>
.tk-loading {
  padding: var(--ek-space-5) var(--ek-space-6);
}

.tk-detail {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

/* Zaman çizgisi */
.tk-scroll {
  padding: var(--ek-space-4) var(--ek-space-5);
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
}

.tk-scroll:focus-visible {
  outline: none;
  box-shadow: inset var(--ek-focus-ring);
}

.tk-timeline {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tk-day {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-type-subheading-weight);
}

.tk-day::before,
.tk-day::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ek-color-border-subtle);
}

.tk-event {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-align: center;
}

.tk-event__icon {
  font-size: var(--ek-icon-sm);
}

.tk-event__text {
  font-weight: var(--ek-type-subheading-weight);
}

.tk-msg {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  max-width: 78%;
  min-width: 0;
}

.tk-msg--mine {
  align-self: flex-end;
  align-items: flex-end;
}

.tk-msg--support {
  align-self: flex-start;
  align-items: flex-start;
}

.tk-msg__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-2);
  max-width: 100%;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.tk-msg--mine .tk-msg__meta {
  justify-content: flex-end;
}

.tk-msg__sender {
  color: var(--ek-color-content-default);
  font-weight: var(--ek-type-subheading-weight);
  overflow-wrap: anywhere;
}

.tk-msg__role {
  color: var(--ek-color-content-muted);
  font-weight: 400;
}

.tk-msg__bubble {
  max-width: 100%;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.tk-msg--mine .tk-msg__bubble {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  border-bottom-right-radius: var(--ek-radius-control);
}

.tk-msg--support .tk-msg__bubble {
  background: var(--ek-color-surface-muted);
  border-bottom-left-radius: var(--ek-radius-control);
}

.tk-empty {
  padding: var(--ek-space-6) 0;
  color: var(--ek-color-content-muted);
  text-align: center;
}

/* Yanıt alanı */
.tk-reply {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.tk-reply__bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
}

.tk-reply__bar .tk-counter {
  margin-left: auto;
}

.tk-hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.tk-counter {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-variant-numeric: tabular-nums;
}

.tk-counter--warn {
  color: var(--ek-color-warning-emphasis);
  font-weight: var(--ek-type-subheading-weight);
}

.tk-counter--over {
  color: var(--ek-color-error-emphasis);
  font-weight: var(--ek-type-subheading-weight);
}

.tk-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-error-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.tk-alert__icon {
  flex: none;
  margin-top: 2px;
  font-size: var(--ek-icon-md);
}

.tk-alert__title,
.tk-alert__hint {
  margin: 0;
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-body-line);
}

.tk-alert__title {
  font-weight: var(--ek-type-subheading-weight);
}

.tk-closed {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-muted);
}

.tk-closed p {
  margin: 0;
}

.tk-closed__icon {
  flex: none;
  margin-top: 2px;
  font-size: var(--ek-icon-md);
}

@media (max-width: 599px) {
  .tk-scroll {
    padding-left: var(--ek-space-3);
    padding-right: var(--ek-space-3);
  }

  .tk-msg {
    max-width: 92%;
  }
}
</style>
