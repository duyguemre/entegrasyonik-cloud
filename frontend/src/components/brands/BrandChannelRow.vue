<!--
  Marka detayındaki TEK kanal satırı: [kanal rozeti] [eşli ise kanaldaki marka + ✓ / "Eşlenmedi"] [Eşle | Değiştir].
  "Eşle/Değiştir" satırı yerinde genişletir: kanal marka arama alanı (yerel marka adıyla önden dolu, "Önerilen"),
  Vazgeç / Kaydet. Kayıt: `BrandService/saveIntegrationBrand` (gövde DEĞİŞMEDİ). Kaydedilmeden eşleme değişmez (güvenli);
  kaydediliyor / başarı / hata durumu satır içinde. Marka eşlemesi sunmayan kanal düğmesiz, soluk not alır.
-->
<template>
  <li class="bcr" :class="{ 'is-open': editing }">
    <div class="bcr__main">
      <EkChannelBadge :code="channel.code" :name="channel.title" size="sm" />
      <div class="bcr__state">
        <span v-if="!channel.mappable" class="bcr__none">Marka eşlemesi sunmuyor</span>
        <template v-else-if="saved">
          <v-icon class="bcr__ok" icon="mdi-check-circle-outline" size="16" aria-hidden="true" />
          <span class="bcr__brand" :title="saved.title"><span class="sr-only">Eşli: </span>{{ saved.title }}</span>
          <EkStatusChip v-if="justSaved" tone="success" label="Kaydedildi" />
        </template>
        <span v-else class="bcr__none">Eşlenmedi</span>
      </div>
      <EkButton v-if="channel.mappable && !editing" tone="secondary" size="sm"
        :icon="saved ? 'mdi-swap-horizontal' : 'mdi-link-variant'"
        :aria-label="`${channel.title} markasını ${saved ? 'değiştir' : 'eşle'}`" @click="open()">
        {{ saved ? 'Değiştir' : 'Eşle' }}
      </EkButton>
    </div>

    <div v-if="editing" class="bcr__edit" data-ek-esc-local @keydown.esc.stop="cancel()">
      <BrandIntegrationSelectBoxComponent v-model="draft" :integrationCode="channel.code" :prefill="brand.title" />
      <p v-if="error" class="bcr__error" role="alert">
        <v-icon icon="mdi-alert-circle-outline" size="16" aria-hidden="true" />
        Eşleme kaydedilemedi — kanal bağlantınızı kontrol edip tekrar deneyin.
      </p>
      <div class="bcr__actions">
        <EkButton tone="secondary" size="sm" :disabled="saving" @click="cancel()">Vazgeç</EkButton>
        <EkButton tone="primary" size="sm" icon="mdi-content-save-outline" :loading="saving"
          :disabled="draft?.id == null || draft?.id == saved?.id" @click="save()">Kaydet</EkButton>
      </div>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { EkButton, EkChannelBadge, EkStatusChip } from '@entegrasyonik/ui/components'
import BrandIntegrationSelectBoxComponent from '@/components/BrandIntegrationSelectBoxComponent.vue'
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore'
import type { BrandChannel } from '@/composables/brandChannels'

const props = defineProps<{ brand: any; channel: BrandChannel }>()
const emit = defineEmits<{ saved: [code: string, value: any] }>()

const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const editing = ref(false)
const draft: any = ref()
const saving = ref(false)
const error = ref(false)
const justSaved = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const saved = computed(() => {
  const s = props.brand?.platforms?.[props.channel.code]
  return s?.id != null && s.id !== '' ? s : undefined
})

const open = () => {
  draft.value = saved.value ? JSON.parse(JSON.stringify(saved.value)) : undefined
  error.value = false
  justSaved.value = false
  editing.value = true
}
const cancel = () => { editing.value = false; error.value = false }

const save = async () => {
  if (draft.value?.id == null) return
  saving.value = true
  error.value = false
  const response = await restApi.post('BrandService/saveIntegrationBrand', {
    brandId: props.brand._id, integrationCode: props.channel.code, integrationBrand: draft.value,
  })
  saving.value = false
  if (response && response.result == true) {
    emit('saved', props.channel.code, JSON.parse(JSON.stringify(draft.value)))
    editing.value = false
    justSaved.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (justSaved.value = false), 3000)
    snackbarStore.addSnackbar({ show: true, text: 'Platform marka eşlemesi kaydedildi', timeout: 2000, color: 'success' })
  } else {
    error.value = true
  }
}

onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<style scoped>
.bcr {
  border-bottom: 1px solid var(--ek-color-border-subtle);
  list-style: none;
}

.bcr:last-child {
  border-bottom: 0;
}

.bcr__main {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 52px;
  padding: var(--ek-space-2) 0;
}

.bcr__main > :first-child {
  flex: none;
}

.bcr__state {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.bcr__ok {
  flex: none;
  color: var(--ek-color-success-emphasis);
}

.bcr__brand {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
}

.bcr__none {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-sm);
}

.bcr__edit {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin-bottom: var(--ek-space-3);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-sunken);
}

.bcr__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ek-space-2);
}

.bcr__error {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-caption-size);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
