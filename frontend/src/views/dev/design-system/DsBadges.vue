<!-- Vitrin §8 — durum çipi, rozet, klavye tuşu ve tooltip. -->
<template>
  <div class="ds-badge-grid">
    <DsSpecimen title="Durum çipi (EkStatusChip)" note="Ekran renk seçmez, durum kodu verir (status-map.ts). Açık zemin + koyu metin, aynı şekil/boyut.">
      <div class="ds-row">
        <EkStatusChip v-for="s in statuses" :key="s.label" :tone="s.tone" :label="s.label" />
      </div>
      <div class="ds-row">
        <EkStatusChip v-for="s in statuses" :key="`d-${s.label}`" :tone="s.tone" :label="s.label" dot />
      </div>
    </DsSpecimen>
    <DsSpecimen title="Rozet (EkBadge) ve klavye tuşu (EkKbd)" note="Dolgu sayaç yalnızca yeni/okunmamış adedi; mikro etiket tür/sürüm için.">
      <div class="ds-row">
        <EkBadge variant="count" :text="4" />
        <EkBadge variant="count" tone="error" :text="12" />
        <EkBadge variant="count" tone="neutral" :text="128" />
        <EkBadge text="Yeni" />
        <EkBadge text="Trendyol" tone="warning" />
        <EkBadge text="Beta" tone="info" />
        <EkBadge text="Taslak" tone="neutral" />
      </div>
      <div class="ds-row">
        <EkKbd :keys="['Ctrl', 'K']" />
        <EkKbd :keys="['Ctrl', '→']" />
        <EkKbd :keys="['Alt', 'S']" />
        <EkKbd keys="Esc" />
      </div>
    </DsSpecimen>
  </div>
  <DsSpecimen title="Tooltip (EkTooltip)" note="Ters yüzey, caption; kısayol varsa içinde gösterilir. 400 ms gecikme, altta. Yalnız-ikon düğmenin aria-label'ının YERİNE geçmez.">
    <div class="ds-row ds-row--tips">
      <EkTooltip text="Menüyü daralt" :shortcut="['Ctrl', 'B']" inline>
        <EkButton tone="secondary" icon="mdi-menu-open" icon-only aria-label="Menüyü daralt" />
      </EkTooltip>
      <EkTooltip text="Sipariş TY-102348 · Kargo Bekliyor" inline>
        <span class="ds-truncate">Sipariş TY-102348 · Kargo…</span>
      </EkTooltip>
      <EkTooltip text="Filtreleri temizle" :shortcut="['Alt', 'C']" inline>
        <EkButton tone="ghost" icon="mdi-filter-remove-outline" icon-only aria-label="Filtreleri temizle" />
      </EkTooltip>
      <EkTooltip text="Gerçek tooltip — üzerine gelin" shortcut="F1">
        <EkButton tone="secondary" icon="mdi-help-circle-outline">Üzerine gel</EkButton>
      </EkTooltip>
    </div>
  </DsSpecimen>
</template>

<script setup lang="ts">
import DsSpecimen from './DsSpecimen.vue'
import { EkStatusChip, EkBadge, EkKbd, EkTooltip, EkButton } from '@entegrasyonik/ui/components'
import type { StatusTone } from '@/design/status-map'

const statuses: Array<{ tone: StatusTone; label: string }> = [
  { tone: 'neutral', label: 'Kuyrukta' },
  { tone: 'info', label: 'İşleniyor' },
  { tone: 'success', label: 'Tamamlandı' },
  { tone: 'warning', label: 'Kargo bekliyor' },
  { tone: 'danger', label: 'Hatalı' },
]
</script>

<style scoped>
.ds-badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--ek-space-4);
}

.ds-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.ds-row + .ds-row {
  margin-top: var(--ek-space-4);
}

.ds-row--tips {
  align-items: flex-start;
  gap: var(--ek-space-8);
}

.ds-truncate {
  display: inline-block;
  max-width: 180px;
  padding: var(--ek-space-2) var(--ek-space-3);
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-tab-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
