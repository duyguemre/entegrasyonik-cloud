<template>
  <EkDialog
    :model-value="!!reqId"
    title="İstek zinciri"
    :description="reqId ? `reqId ${reqId} — log, denetim ve entegrasyon çağrıları tek zaman çizelgesinde` : ''"
    icon="mdi-source-branch"
    width="lg"
    hide-cancel
    confirm-label="Kapat"
    @confirm="$emit('close')"
    @update:model-value="(v: boolean) => !v && $emit('close')"
  >
    <EkSkeleton v-if="loading" type="detail" :rows="4" />
    <EkEmptyState v-else-if="error" variant="no-results" title="İz bulunamadı" :message="error" />
    <div v-else-if="trace" class="bo-trace">
      <div class="bo-trace__summary">
        <span><strong class="ek-num">{{ trace.durationMs }} ms</strong> toplam</span>
        <span>{{ trace.events.length }} olay</span>
        <span v-if="trace.tid">müşteri <RouterLink :to="`/musteriler/${trace.tid}`" @click="$emit('close')">#{{ trace.tid }}</RouterLink></span>
        <span class="bo-muted">{{ formatDateTime(trace.startedAt) }}</span>
      </div>
      <ol class="bo-trace__list">
        <li v-for="(e, i) in trace.events" :key="i" class="bo-trace__item" :class="[`is-${e.kind}`, e.level ? `lvl-${e.level}` : '']">
          <span class="bo-trace__offset ek-num">+{{ offset(e.t) }} ms</span>
          <span class="bo-trace__node" aria-hidden="true"><v-icon :icon="KIND[e.kind].icon" /></span>
          <div class="bo-trace__body">
            <p class="bo-trace__title">
              <span class="bo-trace__kind">{{ KIND[e.kind].label }}</span>
              <EkStatusChip v-if="e.level && e.level !== 'info'" :tone="LEVEL[e.level].tone" :label="LEVEL[e.level].label" />
              <span v-if="e.status" class="bo-trace__status" :class="{ 'is-bad': isBad(e.status) }">{{ e.status }}</span>
              <span v-if="e.durationMs" class="bo-trace__dur ek-num">{{ e.durationMs }} ms</span>
            </p>
            <p class="bo-trace__msg">{{ e.title }}</p>
            <div v-if="e.durationMs" class="bo-trace__bar" aria-hidden="true">
              <span :style="barStyle(e)" />
            </div>
          </div>
          <span class="bo-trace__meta">{{ e.src ? SOURCE[e.src] : e.integ ? CHANNEL[e.integ] ?? e.integ : '' }}</span>
        </li>
      </ol>
    </div>
  </EkDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { EkDialog, EkEmptyState, EkSkeleton, EkStatusChip } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { AdminApiError } from '@bo/api/client'
import type { GetTraceResponse, TraceEvent } from '@bo/api/contract'
import { CHANNEL, LEVEL, SOURCE } from '@bo/utils/labels'
import { formatDateTime } from '@bo/utils/format'

const props = defineProps<{ reqId: string | null }>()
defineEmits<{ close: [] }>()

const KIND = {
  log: { label: 'Log', icon: 'mdi-text-box-outline' },
  audit: { label: 'Denetim', icon: 'mdi-shield-check-outline' },
  call: { label: 'Entegrasyon çağrısı', icon: 'mdi-swap-horizontal' },
} as const

const trace = ref<GetTraceResponse | null>(null)
const loading = ref(false)
const error = ref('')

watch(
  () => props.reqId,
  async (id) => {
    trace.value = null
    error.value = ''
    if (!id) return
    loading.value = true
    try {
      trace.value = await api.call('LogCenterService/getTrace', { reqId: id })
    } catch (e) {
      error.value = e instanceof AdminApiError ? e.message : 'İz yüklenemedi.'
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const offset = (t: string) => Math.max(0, Date.parse(t) - Date.parse(trace.value!.startedAt))
const isBad = (s: string) => /^[45]\d\d$/.test(s) || s === 'fail' || s === 'error'
function barStyle(e: TraceEvent) {
  const total = Math.max(1, trace.value!.durationMs)
  return { marginLeft: `${(offset(e.t) / total) * 100}%`, width: `${Math.max(2, ((e.durationMs ?? 0) / total) * 100)}%` }
}
</script>

<style scoped>
.bo-trace__summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2) var(--ek-space-5);
  margin-bottom: var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.bo-trace__summary a {
  color: var(--ek-color-action-emphasis);
}

.bo-trace__list {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-trace__item {
  position: relative;
  display: grid;
  grid-template-columns: 76px 28px minmax(0, 1fr) auto;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) 0;
}

.bo-trace__item + .bo-trace__item::before {
  position: absolute;
  top: -6px;
  left: calc(76px + var(--ek-space-3) + 13px);
  height: 16px;
  border-left: 2px solid var(--ek-color-border-default);
  content: '';
}

.bo-trace__offset {
  padding-top: 4px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-align: right;
}

.bo-trace__node {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.is-call .bo-trace__node {
  border-color: var(--ek-color-action-border);
  color: var(--ek-color-action-emphasis);
}

.is-audit .bo-trace__node {
  border-color: var(--ek-color-info-border);
  color: var(--ek-color-info-emphasis);
}

.lvl-error .bo-trace__node,
.lvl-fatal .bo-trace__node {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.lvl-warn .bo-trace__node {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.bo-trace__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
}

.bo-trace__kind {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-trace__status {
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-success-border);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
}

.bo-trace__status.is-bad {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.bo-trace__dur {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-trace__msg {
  margin: 2px 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
}

.bo-trace__bar {
  height: 6px;
  margin-top: var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-sunken);
}

.bo-trace__bar span {
  display: block;
  height: 100%;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action);
}

.bo-trace__meta {
  padding-top: 4px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  white-space: nowrap;
}

@media (max-width: 599px) {
  .bo-trace__item {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .bo-trace__offset,
  .bo-trace__meta {
    display: none;
  }

  .bo-trace__item + .bo-trace__item::before {
    left: 13px;
  }
}
</style>
