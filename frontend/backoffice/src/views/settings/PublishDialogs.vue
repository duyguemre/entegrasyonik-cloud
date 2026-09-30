<!-- Yayın ve geri alma diyalogları: fark tablosu + etki + gerekçe (≥10) + step-up (GuardedDialog). -->
<template>
  <GuardedDialog
    :action="publish"
    title="Değişiklikler yayınlansın mı?"
    :description="cfg.preview ? `Taslak sürüm ${cfg.preview.draftVersion}` : ''"
    :items="publishItems"
    confirm-label="Yayınla"
    confirm-icon="mdi-rocket-launch-outline"
    :danger="cfg.preview?.danger === 'caution' || cfg.preview?.danger === 'dangerous'"
    width="lg"
  >
    <ConfigDiff v-if="cfg.preview" :diff="cfg.preview.diff" :labels="labels" caption="Yayınlanacak değişiklikler" />
  </GuardedDialog>
  <GuardedDialog
    :action="rollback"
    :title="rollback.context.value ? `Sürüm ${rollback.context.value.version} geri alınsın mı?` : 'Geri alma'"
    description="Seçilen sürümün içeriği yeni bir sürüm olarak yayınlanır; mevcut geçmiş silinmez."
    :items="['Şu an yayındaki değerler bu sürümdeki değerlerle değiştirilir.', 'Değer ~15 sn içinde tüm sunucularda etkinleşir (+ en çok 30 sn önbellek).']"
    confirm-label="Geri al"
    confirm-icon="mdi-undo-variant"
    danger
    width="lg"
  >
    <ConfigDiff v-if="rollback.context.value?.diff" :diff="rollback.context.value.diff" :labels="labels" caption="Bu sürümün kendi değişikliği" />
  </GuardedDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import ConfigDiff from './ConfigDiff.vue'
import type { PlatformConfig } from './usePlatformConfig'

import type { usePlatformConfig } from './usePlatformConfig'
const props = defineProps<{ cfg: PlatformConfig; publish: ReturnType<typeof usePlatformConfig>['publish']; rollback: ReturnType<typeof usePlatformConfig>['rollback'] }>()
const labels = computed(() => Object.fromEntries((props.cfg.data?.catalog ?? []).map((c) => [c.key, c.label.tr])))
const publishItems = computed(() => {
  const p = props.cfg.preview
  const items = ['Değerler ~15 sn içinde tüm sunucularda etkinleşir; müşteri uygulaması ek olarak en çok 30 sn önbellekten okuyabilir.']
  if (p) items.unshift(`Etkilenecek aktif müşteri: ${p.impact.approximate ? 'yaklaşık ' : ''}${p.impact.activeTenants}.`)
  if (p?.diff.some((d) => d.key === 'maintenance.enabled' && d.to === true)) items.push('Bakım modu açılıyor: müşteriler veri yazamaz (503 MAINTENANCE).')
  return items
})
</script>
