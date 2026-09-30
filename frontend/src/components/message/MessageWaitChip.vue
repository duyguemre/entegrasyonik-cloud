<!--
  frontend/src/components/message/MessageWaitChip.vue

  C2.5 — yanıt bekleyen mesajın bekleme süresi rozeti ("Bekliyor: 3 sa").
  Ton `messageSla.ts`'ten gelir (eşikler ÖNERİ, pazaryeri SLA'sı değil); boyama `EkStatusChip`'te.
  Renk tek başına anlam taşımaz: süre metin olarak görünür, kritik eşikte etiket de değişir
  ("Uzun bekliyor"). Bekleyen yanıt yoksa `placeholder` açıkken "—" (ekran okuyucuya açıklamalı).
-->
<template>
  <EkTooltip v-if="wait !== null && tooltip" :text="hint">
    <EkStatusChip class="ek-message-wait" :tone="tone" :label="label" :data-tone="tone" />
  </EkTooltip>
  <span v-else-if="wait !== null && showHint" class="ek-message-wait-row">
    <EkStatusChip class="ek-message-wait" :tone="tone" :label="label" :data-tone="tone" />
    <span class="ek-message-wait-row__hint">{{ hint }}</span>
  </span>
  <EkStatusChip v-else-if="wait !== null" class="ek-message-wait" :tone="tone" :label="label" :data-tone="tone" />
  <span v-else-if="placeholder" class="ek-message-wait__none">
    <span aria-hidden="true">—</span><span class="ek-sr-only">{{ t('messages.sla.noWait') }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkTooltip from '@/components/ds/EkTooltip.vue'
import { MESSAGE_WAIT_THRESHOLDS, waitingMs, waitParts, waitTone } from './messageSla'

const props = withDefaults(
  defineProps<{
    message: Record<string, any> | null
    now?: Date
    /** Bekleyen yanıt yoksa "—" göster (liste hücresi). */
    placeholder?: boolean
    /** Fareyle üzerine gelince eşik açıklaması. */
    tooltip?: boolean
    /** Eşik açıklamasını rozetin yanında görünür metin olarak göster (detay paneli). */
    showHint?: boolean
  }>(),
  { now: undefined, placeholder: false, tooltip: false, showHint: false },
)

const { t } = useI18n()

const wait = computed(() => waitingMs(props.message, props.now ?? new Date()))
const tone = computed(() => (wait.value === null ? 'neutral' : waitTone(wait.value)))

const duration = computed(() => {
  if (wait.value === null) return ''
  const { days, hours, minutes } = waitParts(wait.value)
  if (days >= 7) return t('messages.sla.duration.days', { d: days })
  if (days > 0) return hours > 0 ? t('messages.sla.duration.daysHours', { d: days, h: hours }) : t('messages.sla.duration.days', { d: days })
  if (hours > 0) return t('messages.sla.duration.hours', { h: hours })
  if (minutes > 0) return t('messages.sla.duration.minutes', { m: minutes })
  return t('messages.sla.duration.lessThanMinute')
})

const label = computed(() => t(tone.value === 'danger' ? 'messages.sla.waitingLong' : 'messages.sla.waiting', { duration: duration.value }))

const hint = computed(() => t('messages.sla.thresholdHint', {
  duration: duration.value,
  warning: MESSAGE_WAIT_THRESHOLDS.warningHours,
  danger: MESSAGE_WAIT_THRESHOLDS.dangerHours,
}))
</script>

<style scoped>
.ek-message-wait {
  font-variant-numeric: tabular-nums;
}

.ek-message-wait-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.ek-message-wait-row__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-message-wait__none {
  color: var(--ek-color-content-muted);
}
</style>
