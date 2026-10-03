<!--
  BoTableBar — STANDART TABLO ÜST BANDI (BoDataTable ve BoTableFrame içinde otomatik). Solda satır sayısı (bölüm başlığı
  zaten sayaç taşıyorsa gizlenir), sağda klavye ipuçları: J/K satırlar arası, Enter aç (navigation/rowNav.ts — tüm
  `#bo-main` tablolarında çalışır). Dokunmatik ekranda ipuçları gizlenir.
-->
<template>
  <div class="bo-tbar" data-bo-tablebar>
    <span v-if="showCount" class="bo-tbar__count"><b class="ek-num">{{ nf.format(count) }}</b> satır</span>
    <span class="bo-tbar__spacer"></span>
    <slot />
    <span class="bo-tbar__keys" aria-hidden="true">
      <span><EkKbd :keys="['J']" /><EkKbd :keys="['K']" /> satırlar arası</span>
      <span><EkKbd :keys="['Enter']" /> aç</span>
    </span>
    <span class="ek-sr-only">Klavye: J ve K ile satırlar arasında gezinin, Enter ile açın.</span>
  </div>
</template>

<script setup lang="ts">
import { EkKbd } from '@entegrasyonik/ui/components'

withDefaults(defineProps<{ count: number; showCount?: boolean }>(), { showCount: true })
const nf = new Intl.NumberFormat('tr-TR')
</script>

<style scoped>
.bo-tbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-4);
  min-height: 40px;
  padding: var(--ek-space-1) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-tbar__count b {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-tbar__spacer {
  flex: 1;
}

.bo-tbar__keys {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-3);
}

.bo-tbar__keys > span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

@media (pointer: coarse), (max-width: 600px) {
  .bo-tbar__keys {
    display: none;
  }
}

/* BO-LOCAL-01 — tablo üst bandı: başlık satırıyla aynı sakin zemin + ince çizgi (müşteri uygulamasındaki liste bandı). */
.bo-tbar {
  border-bottom-color: var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}
</style>
