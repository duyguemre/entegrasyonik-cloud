<!--
  Tablo parçası: ≤ 50 satır; "Daha fazla göster" (transport.more, LLM'siz) → toplam ≤ 500; "Ekranda aç" (openIn) ve
  "Tam ekranda göster" (aynı veri, geniş görünüm). Yeni satırlar yüklenince odak ilk yeni satıra.
-->
<template>
  <section class="ek-chat-table" :aria-labelledby="titleId">
    <header class="ek-chat-part-head">
      <p :id="titleId" class="ek-chat-part-head__title">{{ title }}</p>
      <span class="ek-chat-part-head__meta">{{ countText }}</span>
      <div class="ek-chat-part-head__actions">
        <EkButton size="sm" tone="ghost" icon="mdi-arrow-expand" icon-only :aria-label="t('table.fullscreen')" :title="t('table.fullscreen')" @click="fullscreen = true" />
        <EkButton v-if="openTarget" size="sm" tone="ghost" trailing-icon="mdi-arrow-right" @click="open">{{ t('table.openIn') }}</EkButton>
      </div>
    </header>
    <ChatTableGrid ref="gridRef" :columns="part.columns" :rows="part.rows" :row-key="part.rowKey" :caption="caption" :region-label="t('table.scrollRegion', { title })" />
    <footer v-if="canLoadMore || capped || moreFailed" class="ek-chat-table__foot">
      <EkButton v-if="canLoadMore" size="sm" tone="secondary" icon="mdi-chevron-down" :loading="loading" @click="loadMore">
        {{ t('table.more') }}
      </EkButton>
      <p v-if="moreFailed" class="ek-chat-table__note is-error" role="status">{{ t('table.moreFailed') }}</p>
      <p v-if="capped" class="ek-chat-table__note">{{ t('table.limit', { max: TABLE_ROW_CAP }) }}</p>
    </footer>

    <v-dialog v-model="fullscreen" fullscreen :scrim="false" transition="fade-transition">
      <section class="ek-chat-table-dialog" :aria-labelledby="`${titleId}-dlg`">
        <header class="ek-chat-table-dialog__head">
          <p :id="`${titleId}-dlg`" class="ek-chat-table-dialog__title">{{ title }} <span class="ek-chat-part-head__meta">{{ countText }}</span></p>
          <EkButton v-if="canLoadMore" size="sm" tone="secondary" icon="mdi-chevron-down" :loading="loading" @click="loadMore">{{ t('table.more') }}</EkButton>
          <EkButton v-if="openTarget" size="sm" tone="ghost" trailing-icon="mdi-arrow-right" @click="open">{{ t('table.openIn') }}</EkButton>
          <EkButton size="sm" tone="ghost" icon="mdi-close" icon-only :aria-label="t('table.closeFullscreen')" @click="fullscreen = false" />
        </header>
        <div class="ek-chat-table-dialog__body">
          <ChatTableGrid :columns="part.columns" :rows="part.rows" :row-key="part.rowKey" :caption="caption" :region-label="t('table.scrollRegion', { title })" />
        </div>
      </section>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import type { TablePart } from '../../protocol/v1'
import { useChat } from '../../state/useChat'
import { TABLE_ROW_CAP } from '../../state/messages'
import ChatTableGrid from './ChatTableGrid.vue'

const props = defineProps<{ part: TablePart; messageId?: string }>()
const chat = useChat()
const { t } = chat
const titleId = `ek-chat-table-${useId()}`
const gridRef = ref<InstanceType<typeof ChatTableGrid> | null>(null)
const loading = ref(false)
const moreFailed = ref(false)
const fullscreen = ref(false)

const title = computed(() => props.part.title || t('table.defaultTitle'))
const shown = computed(() => props.part.rows.length)
const countText = computed(() =>
  props.part.total != null && props.part.total !== shown.value
    ? t('table.countTotal', { shown: formatNumber(shown.value), total: formatNumber(props.part.total) })
    : t('table.count', { count: formatNumber(shown.value) }),
)
const caption = computed(() =>
  props.part.total != null && props.part.total !== shown.value
    ? t('table.captionTotal', { title: title.value, shown: formatNumber(shown.value), total: formatNumber(props.part.total) })
    : t('table.caption', { title: title.value, count: formatNumber(shown.value) }),
)
const capped = computed(() => shown.value >= TABLE_ROW_CAP)
const canLoadMore = computed(() => !!props.part.more && !capped.value && !!props.messageId)
const openTarget = computed(() => (props.part.openIn ? chat.host.resolveLink(props.part.openIn) : null))

function open() {
  chat.host.track?.({ name: 'chat.link', entity: 'screen' })
  fullscreen.value = false
  openTarget.value?.open()
}

async function loadMore() {
  if (!props.messageId || loading.value) return
  loading.value = true
  moreFailed.value = false
  try {
    const result = await chat.loadMore(props.messageId, props.part.id)
    if (result && !fullscreen.value) {
      await nextTick()
      gridRef.value?.focusRow(result.firstNewIndex)
    }
  } catch {
    moreFailed.value = true
  } finally {
    loading.value = false
  }
}
</script>
