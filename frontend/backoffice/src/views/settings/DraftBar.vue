<!--
  `_platform` taslak çubuğu (Sistem ayarları + Rekabet ayarları ortak). BO-WDG:
  - kaydetme hatası (`cfg.saveError`) TEK yerde, her sekmede görünür (sekmeler kendi kopyasını çizmez)
  - "Taslağı at" (sözlük `discard`) sunucudaki taslağı geri alınamaz siler → önce onay: kaç ayar, geri alınamaz.
    Düğme "Vazgeç" değil: onay diyaloğunun kendi "Vazgeç"i (iptal) ile aynı adı taşıyıp ters anlama gelmesin.
-->
<template>
  <EkAlert v-if="cfg.saveError" ref="errorRef" tone="error" live dense class="bo-draftbar" :text="cfg.saveError.message" data-testid="save-error" />

  <EkAlert v-if="cfg.hasDraft" tone="info" live dense class="bo-draftbar" data-testid="draft-bar" title="Yayınlanmamış taslak var" :text="`${cfg.preview ? cfg.preview.diff.length + ' ayar değişecek. ' : ''}Yayınlanana kadar müşteri uygulaması bundan etkilenmez.`">
    <template #actions>
      <EkButton size="sm" tone="primary" :disabled="!cfg.preview" @click="cfg.publish.open({})">Önizle ve yayınla</EkButton>
      <BoAction kind="discard" label="Taslağı at" size="sm" :loading="cfg.discarding" data-testid="discard-draft" @click="confirmOpen = true" />
    </template>
  </EkAlert>

  <EkConfirmDialog
    v-model="confirmOpen"
    title="Taslak atılsın mı?"
    :description="discardText"
    :confirm-label="boActionLabel('discard', 'Taslağı')"
    danger
    :loading="cfg.discarding"
    @confirm="discard"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { EkAlert, EkButton, EkConfirmDialog } from '@entegrasyonik/ui/components'
import BoAction from '@bo/components/r2/BoAction.vue'
import { boActionLabel } from '@bo/components/r2/actions'
import type { PlatformConfig } from './usePlatformConfig'

const props = defineProps<{ cfg: PlatformConfig }>()
const confirmOpen = ref(false)

/** Ne silinir: taslaktaki ayar sayısı (önizleme yoksa yerelde değişen alan sayısı). */
const discardText = computed(() => {
  const n = props.cfg.preview ? props.cfg.preview.diff.length : props.cfg.changedKeys.length
  const what = n ? `Taslaktaki ${n} ayar değişikliği silinir` : 'Taslak silinir'
  return `${what}; yayındaki değerler geçerli kalır. Bu işlem geri alınamaz.`
})

async function discard() {
  await props.cfg.discard()
  confirmOpen.value = false
}

/** Alan hatası olmayan kaydetme hatası (çakışma, ağ) sayfanın üstünde: görünür alana getirilir. */
const errorRef = ref<{ $el?: HTMLElement } | null>(null)
watch(
  () => props.cfg.saveError,
  (e) => {
    if (e && !Object.keys(props.cfg.fieldErrors).length) void nextTick(() => errorRef.value?.$el?.scrollIntoView?.({ block: 'nearest' }))
  },
)
</script>

<style scoped>
.bo-draftbar {
  margin-bottom: var(--ek-space-4);
}
</style>
