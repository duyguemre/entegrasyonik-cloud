<!-- Vitrin §11 — liste standardı: filtre paneli + aktif çipler + yapışkan başlıklı tablo + ALTA SABİT sayfalama. -->
<template>
  <DsSpecimen title="Liste ekranı (EkListFrame)" note="Yalnızca satırlar kayar: filtre, tablo başlığı ve sayfalama yerinde kalır. Sayfa içi filtre yalnızca bu sekmeyi etkiler." canvas>
    <div class="ds-list">
      <EkListFrame label="Siparişler (örnek)">
        <template #filters>
          <EkFilterPanel v-model:collapsed="collapsed" :active-count="filters.length" :heading-level="3" @submit="noop" @reset="filters = []">
            <v-text-field label="Sipariş no" model-value="TY-1023" />
            <v-select label="Kanal" :items="['Tümü', 'Trendyol', 'Hepsiburada', 'N11']" model-value="Trendyol" />
            <v-select label="Durum" :items="['Tümü', 'Kargo bekliyor', 'Hazırlanıyor']" model-value="Kargo bekliyor" />
            <v-text-field label="Sipariş tarihi" type="date" model-value="2026-09-29" prepend-inner-icon="mdi-calendar-outline" />
            <v-text-field label="Müşteri" />
            <v-text-field label="Minimum tutar" />
            <v-text-field label="Maksimum tutar" />
            <v-checkbox label="Yalnızca faturası kesilmemiş" :model-value="true" />
            <template #extra-actions>
              <EkButton tone="ghost" size="sm" icon="mdi-content-save-outline">Filtreyi kaydet</EkButton>
            </template>
          </EkFilterPanel>
          <EkActiveFilters :filters="filters" @remove="(k) => (filters = filters.filter((f) => f.key !== k))" @clear="filters = []" />
        </template>

        <template #toolbar>
          <div class="ds-selection" :class="{ 'is-on': selected.length }">
            <template v-if="selected.length">
              <span class="ds-selection__count"><strong>{{ selected.length }}</strong> sipariş seçildi</span>
              <EkButton tone="secondary" size="sm" icon="mdi-printer-outline">Etiket yazdır</EkButton>
              <EkButton tone="secondary" size="sm" icon="mdi-receipt-text-outline">Fatura oluştur</EkButton>
              <EkButton tone="ghost" size="sm" @click="selected = []">Seçimi kaldır</EkButton>
            </template>
            <span v-else class="ds-selection__hint">Toplu işlem için satır seçin</span>
          </div>
        </template>

        <EkDataGrid
          v-model:selected="selected"
          v-model:sort="sort"
          :columns="orderColumns"
          :rows="pageRows"
          label="Sipariş listesi"
          selectable
          :force-hover-index="3"
        >
          <template #cell-channel="{ value }">
            <span class="ds-channel"><span class="ds-channel__dot" aria-hidden="true"></span>{{ value }}</span>
          </template>
          <template #cell-status="{ row }">
            <EkStatusChip :tone="row.status.tone" :label="row.status.label" />
          </template>
          <template #cell-actions="{ row }">
            <span class="ds-row-actions">
              <EkButton tone="ghost" size="sm" icon="mdi-eye-outline" icon-only :aria-label="`${row.id} detayını aç`" />
              <EkContextMenu :groups="rowMenu" :label="`${row.id} işlemleri`">
                <template #activator="{ props }">
                  <EkButton v-bind="props" tone="ghost" size="sm" icon="mdi-dots-horizontal" icon-only :aria-label="`${row.id} işlemleri`" />
                </template>
              </EkContextMenu>
            </span>
          </template>
        </EkDataGrid>

        <template #pager>
          <EkPagerBar v-model:page="page" v-model:page-size="pageSize" :total="148" label="Sipariş sayfalama">
            <template #trailing>
              <EkButton tone="secondary" size="sm" icon="mdi-microsoft-excel">Excel'e aktar</EkButton>
            </template>
          </EkPagerBar>
        </template>
      </EkListFrame>
    </div>
  </DsSpecimen>

  <div class="ds-list-states">
    <DsSpecimen title="Yükleniyor (iskelet)" note="Başlık korunur, spinner yok; düzen sıçramaz." canvas>
      <div class="ds-list ds-list--small">
        <EkListFrame label="Yükleniyor örneği">
          <EkDataGrid :columns="orderColumns.slice(0, 5)" :rows="[]" label="Yükleniyor örneği tablosu" selectable loading :skeleton-rows="5" />
        </EkListFrame>
      </div>
    </DsSpecimen>
    <DsSpecimen title="Boş durum (filtre sonucu)" note="Hata ile boş AYRI gösterilir; boşta tek eylem." canvas>
      <div class="ds-list ds-list--small">
        <EkListFrame label="Boş durum örneği">
          <EkDataGrid
            :columns="orderColumns.slice(0, 5)"
            :rows="[]"
            label="Boş durum örneği tablosu"
            empty-title="Bu filtrelerle sipariş yok"
            empty-text="Tarih aralığını genişletin veya kanal filtresini kaldırın."
          >
            <template #empty-action>
              <EkButton tone="secondary" size="sm" icon="mdi-filter-remove-outline">Filtreleri temizle</EkButton>
            </template>
          </EkDataGrid>
        </EkListFrame>
      </div>
    </DsSpecimen>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import DsSpecimen from './DsSpecimen.vue'
import EkListFrame from '@/components/ds/EkListFrame.vue'
import EkFilterPanel from '@/components/ds/EkFilterPanel.vue'
import EkActiveFilters, { type EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue'
import EkDataGrid, { type EkGridSort } from '@/components/ds/EkDataGrid.vue'
import EkPagerBar from '@/components/ds/EkPagerBar.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkContextMenu from '@/components/ds/EkContextMenu.vue'
import { demoOrders, orderColumns, rowMenu } from './demoData'

const collapsed = ref(false)
const filters = ref<EkActiveFilterChip[]>([
  { key: 'no', label: 'Sipariş no', value: 'TY-1023' },
  { key: 'channel', label: 'Kanal', value: 'Trendyol' },
  { key: 'status', label: 'Durum', value: 'Kargo bekliyor' },
  { key: 'date', label: 'Tarih', value: '29.09.2026' },
])
const selected = ref<Array<string | number>>([demoOrders[1].id, demoOrders[2].id])
const sort = ref<EkGridSort>({ key: 'date', dir: 'desc' })
const page = ref(1)
const pageSize = ref(25)

const pageRows = computed(() => {
  const rows = [...demoOrders]
  if (sort.value) {
    const { key, dir } = sort.value
    rows.sort((a, b) => String(a[key as keyof typeof a]).localeCompare(String(b[key as keyof typeof b]), 'tr') * (dir === 'asc' ? 1 : -1))
  }
  return rows
})

const noop = () => undefined
</script>

<style scoped>
.ds-list {
  height: 760px;
}

.ds-list--small {
  height: 340px;
}

.ds-list-states {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: var(--ek-space-4);
}

.ds-selection {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 48px;
  padding: var(--ek-space-2) var(--ek-space-4);
}

.ds-selection.is-on {
  background: var(--ek-color-selection);
  box-shadow: inset 3px 0 0 var(--ek-color-action);
}

.ds-selection__count {
  margin-right: auto;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
}

.ds-selection__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-channel {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ds-channel__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-neutral);
}

.ds-row-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}
</style>
