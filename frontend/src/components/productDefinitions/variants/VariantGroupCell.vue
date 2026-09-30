<!--
  frontend/src/components/productDefinitions/variants/VariantGroupCell.vue

  B1 — rowspan'lı varyant GRUP hücresi (ör. Renk: "Siyah · 4 varyant"). Ürün güncelle varyant ızgarası (`grid/VariantGrid.vue`)
  ve ürün listesindeki satır altı varyant listesi (`ProductVariantListComponent.vue`) AYNI bileşeni kullanır.
  Kök `<td>`: `rowspan`, `role`, `aria-colindex`, konum sınıfları (yapışkan kolon vb.) çağırandan geçer.
  Etiket grubun üstünde yapışır (`--ek-vgroup-top`: çağıranın yapışık başlık yüksekliği) → uzun grupta kaydırırken ad görünür kalır.
  Grup sırası / rowspan hesabı: `useVariantGrouping.ts` + `grid/variantSheet.ts`.
-->
<template>
  <td class="ek-vgroup" :class="{ 'is-alt': alt }">
    <div class="ek-vgroup__label">
      <span class="ek-vgroup__title">{{ title }}</span>
      <span class="ek-vgroup__meta"><span class="ek-num">{{ count }}</span> varyant<slot name="meta" /></span>
    </div>
  </td>
</template>

<script setup lang="ts">
defineProps<{
  /** Grup değeri (ör. "Siyah"). */
  title: string
  /** Gruptaki TOPLAM varyant sayısı (görünür pencere kırpsa da). */
  count: number
  /** Ardışık grupları ayırmak için ikinci zemin tonu. */
  alt?: boolean
}>()
</script>

<style scoped>
/* `td.` öneki: çağıranın genel hücre kuralından (ör. `.vg-td { vertical-align: middle }`) sıra bağımsız önde. */
td.ek-vgroup {
  vertical-align: top;
  padding: 0;
  background: var(--ek-color-surface-sunken);
  border-right: 1px solid var(--ek-color-border-default);
  border-top: 1px solid var(--ek-color-border-strong);
}

td.ek-vgroup.is-alt { background: var(--ek-color-surface-muted); }

.ek-vgroup__label {
  position: sticky;
  top: var(--ek-vgroup-top, 0px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ek-space-3);
  white-space: normal;
}

.ek-vgroup__title {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  overflow-wrap: anywhere;
}

.ek-vgroup__meta {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
</style>
