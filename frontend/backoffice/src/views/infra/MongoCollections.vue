<template>
  <BoSection :title="`Koleksiyonlar · ${title}`" description="Bir satırı genişleterek indeksleri görün" icon="mdi-table-multiple" flush data-testid="collections">
    <template #actions>
      <EkButton size="sm" tone="ghost" icon="mdi-close" @click="emit('close')">Kapat</EkButton>
    </template>
    <StateBlock
      :phase="phase"
      :error="list.error.value"
      skeleton="table"
      :rows="5"
      error-title="Koleksiyonlar okunamadı"
      empty-title="Koleksiyon yok"
      empty-message="Bu veritabanında listelenecek koleksiyon bulunmuyor."
      @retry="list.reload()"
    >
      <BoTableFrame :label="`${title} koleksiyonları`" class="bo-coll__frame">
        <template #head>
          <tr>
            <th scope="col">Koleksiyon</th>
            <th scope="col" class="is-num">Belge</th>
            <th scope="col" class="is-num bo-hide-sm">Veri</th>
            <th scope="col" class="is-num bo-hide-sm">İndeks boyutu</th>
            <th scope="col" class="is-num">İndeks</th>
          </tr>
        </template>
            <template v-for="c in list.items.value" :key="c.name">
              <tr>
                <th scope="row">
                  <button type="button" class="bo-coll__toggle" :aria-expanded="open.has(c.name)" :aria-controls="open.has(c.name) ? `idx-${c.name}` : undefined" @click="toggle(c.name)">
                    <v-icon :icon="open.has(c.name) ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="small" aria-hidden="true" />
                    <span>{{ c.name }}</span>
                    <EkStatusChip v-if="c.statsAvailable === false" tone="warning" label="İstatistik okunamadı" />
                  </button>
                </th>
                <template v-if="c.statsAvailable !== false">
                  <td class="is-num ek-num">{{ formatCount(c.documents) }}</td>
                  <td class="is-num ek-num bo-hide-sm">{{ formatBytes(c.dataSize) }}</td>
                  <td class="is-num ek-num bo-hide-sm">{{ formatBytes(c.indexSize) }}</td>
                </template>
                <template v-else>
                  <td class="is-num">—</td>
                  <td class="is-num bo-hide-sm">—</td>
                  <td class="is-num bo-hide-sm">—</td>
                </template>
                <td class="is-num ek-num">{{ c.indexes.length }}<EkStatusChip v-if="unused(c) > 0" class="bo-coll__warn" tone="warning" :label="`${unused(c)} kullanılmıyor`" /></td>
              </tr>
              <tr v-if="open.has(c.name)" :id="`idx-${c.name}`" class="bo-coll__idx">
                <td colspan="5">
                  <ul class="bo-coll__list" :aria-label="`${c.name} indeksleri`">
                    <li v-for="i in c.indexes" :key="i.name">
                      <span class="bo-coll__iname"><code class="bo-code">{{ i.name }}</code>
                        <span class="bo-coll__keys">{{ i.keys.join(', ') }}</span></span>
                      <span class="bo-coll__flags">
                        <EkStatusChip v-if="i.unique" tone="info" label="benzersiz" />
                        <EkStatusChip v-if="i.sparse" tone="neutral" label="seyrek" />
                        <EkStatusChip v-if="i.partial" tone="neutral" label="kısmi" title="Kısmi indeks; filtre değeri gösterilmez" />
                        <EkStatusChip v-if="i.ttlSeconds !== null" tone="neutral" :label="`TTL ${i.ttlSeconds === 0 ? '0 sn' : formatDuration(i.ttlSeconds * 1000)}`" />
                      </span>
                      <span class="bo-coll__usage">
                        <template v-if="i.usage === null">Kullanım: —</template>
                        <EkStatusChip v-else-if="i.usage === 0" tone="warning" icon="mdi-alert-outline" label="Hiç kullanılmadı" title="Yazma maliyeti var; kullanılmıyorsa kaldırmayı değerlendirin" />
                        <template v-else>Kullanım: <span class="ek-num">{{ formatCount(i.usage) }}</span></template>
                        <span v-if="i.usageSince" class="bo-muted"> · {{ formatDate(i.usageSince) }}'den beri</span>
                      </span>
                    </li>
                  </ul>
                </td>
              </tr>
            </template>
      </BoTableFrame>
      <BoPagination :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" @more="list.loadMore()" />
    </StateBlock>
  </BoSection>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { EkButton, EkStatusChip } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { MongoCollection } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTableFrame from '@bo/components/r2/BoTableFrame.vue'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import { formatDate } from '@bo/utils/format'
import { formatBytes, formatCount, formatDuration } from '@bo/utils/units'
import '@bo/styles/kit.css'

const props = defineProps<{ db: 'app' | number; title: string }>()
const emit = defineEmits<{ close: [] }>()

const list = useCursorList<MongoCollection>((cursor) => api.call('BackofficeInfraService/getMongoCollections', { db: props.db, limit: 20, ...(cursor ? { cursor } : {}) }))
onMounted(() => list.reload())
const open = reactive(new Set<string>())
const toggle = (n: string) => (open.has(n) ? open.delete(n) : open.add(n))
const unused = (c: MongoCollection) => c.indexes.filter((i) => i.usage === 0).length
// 404: izinli olmayan/bulunamayan veritabanı — ayrıştırılmaz, tek mesaj.
const phase = computed(() => (list.phase.value === 'error' && list.error.value?.kind === 'notFound' ? 'notFound' : list.phase.value))
</script>

<style scoped>
.bo-coll__frame :deep(.bo-table) {
  min-width: 440px;
}
.bo-coll__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-1) 0;
  border: 0;
  background: transparent;
  color: var(--ek-color-content-strong);
  font: inherit;
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
}
.bo-coll__toggle:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}
.bo-coll__warn {
  margin-left: var(--ek-space-2);
}
.bo-coll__idx > td {
  background: var(--ek-color-surface-sunken);
}
.bo-coll__list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.bo-coll__list li {
  display: grid;
  grid-template-columns: minmax(180px, 1.2fr) auto minmax(180px, 1fr);
  align-items: center;
  gap: var(--ek-space-3);
}
.bo-coll__iname {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.bo-coll__keys {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  overflow-wrap: anywhere;
}
.bo-coll__flags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}
@media (max-width: 767px) {
  .bo-coll__list li {
    grid-template-columns: 1fr;
    gap: var(--ek-space-1);
  }
}
</style>
