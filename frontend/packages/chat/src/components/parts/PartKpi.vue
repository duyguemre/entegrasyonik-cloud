<!-- KPI parçası: 1–6 gösterge. Yön ok + METİN ile verilir (renk tek başına anlam taşımaz); `good` tonu seçer. -->
<template>
  <section class="ek-chat-kpi" :aria-label="part.title || undefined">
    <header v-if="part.title || openTarget" class="ek-chat-part-head">
      <p v-if="part.title" class="ek-chat-part-head__title">{{ part.title }}</p>
      <EkButton v-if="openTarget" class="ek-chat-part-head__action" size="sm" tone="ghost" trailing-icon="mdi-arrow-right" @click="open">{{ t('kpi.openIn') }}</EkButton>
    </header>
    <dl class="ek-chat-kpi__grid">
      <div v-for="item in part.items" :key="item.key" class="ek-chat-kpi__item">
        <dt class="ek-chat-kpi__label">{{ item.label }}</dt>
        <dd class="ek-chat-kpi__value">{{ value(item) }}</dd>
        <dd v-if="item.delta" class="ek-chat-kpi__delta" :class="deltaTone(item)">
          <v-icon :icon="deltaIcon(item)" size="x-small" aria-hidden="true" />
          <span>{{ deltaText(item) }}</span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
import type { KpiItem, KpiPart } from '../../protocol/v1'
import { useChat } from '../../state/useChat'
import { formatDelta, formatKpiValue } from '../cellFormat'

const props = defineProps<{ part: KpiPart; messageId?: string }>()
const chat = useChat()
const { t } = chat
const defaults = computed(() => chat.host.formatDefaults())

const value = (item: KpiItem) => formatKpiValue(item, defaults.value)
const deltaIcon = (item: KpiItem) => (item.delta?.direction === 'up' ? 'mdi-arrow-up' : item.delta?.direction === 'down' ? 'mdi-arrow-down' : 'mdi-minus')
const deltaTone = (item: KpiItem) => (!item.delta || item.delta.direction === 'flat' ? 'is-neutral' : item.delta.good ? 'is-good' : 'is-bad')
function deltaText(item: KpiItem) {
  const d = item.delta!
  if (d.direction === 'flat') return t('kpi.flat')
  const tone = d.good ? t('kpi.good') : t('kpi.bad')
  return `${formatDelta(d)} ${t(d.direction === 'up' ? 'kpi.up' : 'kpi.down')} · ${tone}`
}

const openTarget = computed(() => (props.part.openIn ? chat.host.resolveLink(props.part.openIn) : null))
function open() {
  chat.host.track?.({ name: 'chat.link', entity: 'screen' })
  openTarget.value?.open()
}
</script>
