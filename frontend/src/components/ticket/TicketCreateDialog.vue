<!--
  frontend/src/components/ticket/TicketCreateDialog.vue

  A6a — yeni destek talebi. TEK FORM, üç numaralı bölüm (Talep tipi → Öncelik → Ayrıntılar). Sihirbaz (adım adım)
  yerine tek form seçildi: dört alanın tamamı kısa ve bağımsız, geri/ileri tıklaması ve "içerik hangi adımda"
  belirsizliği bir kazanç getirmiyor; tüm seçimler tek bakışta görünür, eylem çubuğu sabit kalır. Gönderim sonrası
  aynı diyalogda özet (talep no + konu + "Talebi görüntüle") gösterilir; hata halinde içerik KORUNUR.
  Backend gövdesi DEĞİŞMEDİ: `TicketService/openTicket` `{ ticket: { subject, type, priority, message } }`.
  Dosya eki: backend `attachments: []` SABİT yazdığı için ek alanı YOKTUR (BACKLOG: backend gerektirir).
-->
<template>
  <EkDialog
    :model-value="modelValue"
    title="Yeni destek talebi"
    :description="phase === 'success' ? undefined : 'Size nasıl yardımcı olabiliriz? Lütfen detayları paylaşın.'"
    icon="mdi-plus"
    width="lg"
    attach="ticketListView"
    class="ek-ticket-dialog"
    :persistent="phase === 'submitting'"
    :retain-focus="false"
    @update:model-value="onModel"
  >
    <!-- Başarı özeti -->
    <div v-if="phase === 'success'" class="tk-success" role="status">
      <EkIconTile icon="mdi-check-circle-outline" tone="success" size="lg" />
      <h3 ref="successHeading" class="tk-success__title" tabindex="-1">Talebiniz alındı</h3>
      <p class="tk-success__lead">Destek ekibi talebinizi inceleyecek. Yanıtları bu talebin ayrıntısından ve talep listesinden takip edebilirsiniz.</p>
      <dl class="tk-success__summary">
        <div>
          <dt>Talep no</dt>
          <dd class="ek-num">{{ createdNumber }}</dd>
        </div>
        <div>
          <dt>Konu</dt>
          <dd class="tk-success__subject">{{ createdSubject }}</dd>
        </div>
        <div>
          <dt>Talep tipi</dt>
          <dd>{{ TICKET_TYPE_LABELS[createdType] }}</dd>
        </div>
        <div>
          <dt>Öncelik</dt>
          <dd>{{ TICKET_PRIORITY_LABELS[createdPriority] }}</dd>
        </div>
      </dl>
    </div>

    <!-- Form -->
    <form v-else class="tk-form" novalidate @submit.prevent="submit">
      <div v-if="state.error" ref="alertBox" class="tk-alert" role="alert">
        <v-icon icon="mdi-alert-circle-outline" class="tk-alert__icon" aria-hidden="true" />
        <div>
          <p class="tk-alert__title">{{ state.error.title }}</p>
          <p class="tk-alert__hint">{{ state.error.hint }}</p>
        </div>
      </div>

      <section class="tk-section">
        <h3 id="tk-type-label" class="tk-section__title"><span class="tk-step" aria-hidden="true">1</span>Talep tipi</h3>
        <TicketChoiceGroup v-model="draft.type" :options="typeOptions" labelledby="tk-type-label" :disabled="busy" />
      </section>

      <section class="tk-section">
        <h3 id="tk-priority-label" class="tk-section__title"><span class="tk-step" aria-hidden="true">2</span>Öncelik</h3>
        <TicketChoiceGroup v-model="draft.priority" :options="priorityOptions" labelledby="tk-priority-label" layout="segments" :disabled="busy" />
      </section>

      <section class="tk-section">
        <h3 class="tk-section__title"><span class="tk-step" aria-hidden="true">3</span>Ayrıntılar</h3>
        <div class="tk-fields">
          <div>
            <v-text-field
              ref="subjectField"
              v-model="draft.subject"
              label="Konu"
              placeholder="Kısaca sorununuzu belirtin"
              :error-messages="shownErrors.subject"
              :disabled="busy"
              hide-details="auto"
              @blur="touched.subject = true"
            />
            <div class="tk-counter-row">
              <span class="tk-counter" :class="`tk-counter--${subjectCounter.level}`" aria-hidden="true">{{ subjectCounter.label }}</span>
            </div>
          </div>
          <div>
            <v-textarea
              ref="messageField"
              v-model="draft.message"
              label="Mesajınız"
              placeholder="Sorununuzu veya talebinizi detaylıca açıklayın..."
              rows="4"
              auto-grow
              max-rows="12"
              :error-messages="shownErrors.message"
              :disabled="busy"
              hide-details="auto"
              @blur="touched.message = true"
              @keydown="onMessageKey"
            />
            <div class="tk-counter-row">
              <span class="tk-hint"><EkKbd :keys="['Ctrl', 'Enter']" /> ile gönder</span>
              <span class="tk-counter" :class="`tk-counter--${messageCounter.level}`" aria-hidden="true">{{ messageCounter.label }}</span>
            </div>
          </div>
        </div>
        <div class="ek-sr-only" aria-live="polite" aria-atomic="true">{{ liveMessage }}</div>
      </section>
    </form>

    <template #actions>
      <template v-if="phase === 'success'">
        <EkButton tone="secondary" @click="closeDialog">Kapat</EkButton>
        <EkButton tone="primary" icon="mdi-open-in-new" @click="viewCreated">Talebi görüntüle</EkButton>
      </template>
      <template v-else>
        <EkButton tone="secondary" :disabled="busy" @click="closeDialog">Vazgeç</EkButton>
        <EkButton tone="primary" :icon="state.error ? 'mdi-refresh' : 'mdi-send-outline'" :loading="busy" @click="submit">
          {{ state.error ? 'Tekrar dene' : 'Talebi Gönder' }}
        </EkButton>
      </template>
    </template>
  </EkDialog>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { EkDialog, EkButton, EkIconTile, EkKbd } from '@entegrasyonik/ui/components'
import type { EkTone } from '@entegrasyonik/ui/components'
import TicketChoiceGroup, { type ChoiceOption } from './TicketChoiceGroup.vue'
import { TicketTypeEnum, TicketPriorityEnum, TICKET_TYPE_LABELS, TICKET_PRIORITY_LABELS } from '@/types/TicketTypes'
import { TICKET_PRIORITY_TONE } from './composables/ticketPriorityTone'
import { TICKET_TYPE_META, TICKET_PRIORITY_META } from './composables/ticketRules'
import { useTicketCreateForm } from './composables/useTicketCreateForm'
import type { TicketActionResult } from './composables/useTicketActions'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** Talebi oluşturur ve sonucu döner (hata nesnesi DEĞİL, sınıflanmış sonuç). */
  submitTicket: { type: Function as unknown as () => (payload: any) => Promise<TicketActionResult>, required: true },
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; view: [ticket: any] }>()

const {
  draft, state, touched, busy, phase, shownErrors, subjectCounter, messageCounter, liveMessage,
  createdNumber, createdSubject, createdType, createdPriority, validateAll, submitDraft, resetAll,
} = useTicketCreateForm((payload) => props.submitTicket(payload))

const subjectField = ref<any>(null)
const messageField = ref<any>(null)
const successHeading = ref<HTMLElement | null>(null)
const alertBox = ref<HTMLElement | null>(null)

const typeOptions: ChoiceOption[] = Object.values(TicketTypeEnum).map((t) => ({
  value: t,
  label: TICKET_TYPE_LABELS[t],
  description: TICKET_TYPE_META[t].description,
  icon: TICKET_TYPE_META[t].icon,
}))

const TONE_MAP: Record<string, EkTone> = { success: 'success', info: 'info', warning: 'warning', danger: 'error', neutral: 'neutral' }
const priorityOptions: ChoiceOption[] = Object.values(TicketPriorityEnum).map((p) => ({
  value: p,
  label: TICKET_PRIORITY_LABELS[p],
  description: TICKET_PRIORITY_META[p].description,
  icon: TICKET_PRIORITY_META[p].icon,
  tone: TONE_MAP[TICKET_PRIORITY_TONE[p]] ?? 'neutral',
}))

async function submit() {
  if (busy.value) return
  const errors = validateAll()
  if (errors.subject || errors.message) {
    await nextTick()
    ;(errors.subject ? subjectField.value : messageField.value)?.focus?.()
    return
  }
  await submitDraft()
  await nextTick()
  if (phase.value === 'success') successHeading.value?.focus()
  else if (phase.value === 'error') alertBox.value?.scrollIntoView({ block: 'nearest' })
}

function onMessageKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    submit()
  }
}

function viewCreated() {
  const created = (state.value.result as { ticket: any } | null)?.ticket
  closeDialog()
  emit('view', created)
}

function closeDialog() {
  emit('update:modelValue', false)
}

function onModel(v: boolean) {
  if (!v && busy.value) return
  emit('update:modelValue', v)
}

// Başarıdan sonra kapanınca yeni talep için form sıfırlanır; vazgeçilen TASLAK korunur (kaza ile kapatma içerik silmez).
watch(
  () => props.modelValue,
  (open) => {
    if (!open && phase.value === 'success') resetAll()
  },
)
</script>

<style scoped>
.tk-form {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}

.tk-section {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  min-width: 0;
}

.tk-section__title {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.tk-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ek-space-5);
  height: var(--ek-space-5);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-default);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-type-subheading-weight);
}

.tk-fields {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.tk-counter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  margin-top: var(--ek-space-1);
  padding: 0 var(--ek-space-3);
  min-height: var(--ek-space-5);
}

.tk-counter {
  margin-left: auto;
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

.tk-hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
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

.tk-alert__title {
  margin: 0;
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-body-line);
  font-weight: var(--ek-type-subheading-weight);
}

.tk-alert__hint {
  margin: 0;
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-body-line);
}

/* Başarı özeti */
.tk-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-6) 0 var(--ek-space-2);
  text-align: center;
}

.tk-success__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.tk-success__title:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
  border-radius: var(--ek-radius-control);
}

.tk-success__lead {
  max-width: 44ch;
  margin: 0;
  color: var(--ek-color-content-muted);
}

.tk-success__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-4);
  width: 100%;
  margin: var(--ek-space-3) 0 0;
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
  text-align: left;
}

.tk-success__summary dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.tk-success__summary dd {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-type-subheading-weight);
  overflow-wrap: anywhere;
}

.tk-success__subject {
  grid-column: 1 / -1;
}

@media (max-width: 520px) {
  .tk-success__summary {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

<style src="./ticket-dialog.css"></style>
