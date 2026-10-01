<!--
  frontend/src/components/BrandSyncComponent.vue

  Marka DETAY paneli (sağdan açılan yan panel; dar ekranda tam ekran): başlıkta satır içi düzenlenebilir marka adı
  (kalem → alan → Enter kaydeder / Esc vazgeçer), ⋯ menüsünde "Markayı sil" (onayı üst ekran açar) ve kapat.
  Gövde "Kanal eşlemeleri": BAĞLI TÜM kanallar alt alta (bkz. BrandChannelRow) — eşli kanal + kanaldaki marka ✓ /
  "Eşlenmedi" + Eşle|Değiştir; satır yerinde açılıp yerel marka adıyla önden aranır ve öneri sunar.
  İstek gövdeleri DEĞİŞMEDİ (BrandService/updateBrand · saveIntegrationBrand). Silme API'sini üst ekran çağırır.
-->
<template>
  <section v-if="brand" class="ek-brand-sync bd" aria-label="Marka ayrıntısı">
    <header class="bd__head">
      <span class="ek-brand-tile ek-brand-tile--lg" aria-hidden="true"><v-icon icon="mdi-tag-outline" /></span>

      <div class="bd__titlebox">
        <div v-if="!renaming" class="bd__titlerow">
          <h2 class="bd__title" :title="brand.title">{{ brand.title }}</h2>
          <EkButton tone="ghost" size="sm" icon="mdi-pencil-outline" icon-only aria-label="Marka adını düzenle"
            @click="startRename()" />
        </div>
        <div v-else class="bd__rename" data-ek-esc-local @keydown.esc.stop.prevent="renaming = false">
          <v-text-field v-model="newTitle" autofocus clearable maxlength="160" density="compact" variant="outlined"
            hide-details="auto" autocomplete="off" label="Marka Adı" :error-messages="renameError"
            @keyup.enter="saveRename()" />
          <EkButton tone="primary" size="sm" icon="mdi-check" icon-only aria-label="Marka adını kaydet"
            :loading="renameSaving" :disabled="!!renameError || newTitle?.trim() === brand.title" @click="saveRename()" />
          <EkButton tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Düzenlemeden vazgeç"
            @click="renaming = false" />
        </div>
        <span class="bd__meta" :class="meta.tone">{{ meta.text }}</span>
      </div>

      <EkContextMenu :groups="menuGroups" label="Marka işlemleri" location="bottom end" @select="onMenu">
        <template #activator="{ props: act }">
          <EkButton v-bind="act" tone="ghost" size="sm" icon="mdi-dots-horizontal" icon-only aria-label="Marka işlemleri" />
        </template>
      </EkContextMenu>
      <EkButton tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Paneli kapat" @click="emit('close')" />
    </header>

    <div class="bd__body">
      <div class="bd__section-head">
        <h3 class="bd__section-title">Kanal eşlemeleri</h3>
        <span v-if="mappableChannels.length" class="bd__count">{{ mapped.length }}/{{ mappableChannels.length }} kanalda eşli</span>
        <EkHelpHint hint="mapping.brand" />
      </div>

      <EkEmptyState v-if="!channels.length" variant="not-connected" title="Bağlı kanal yok"
        message="Marka eşlemesi için önce bir pazaryeri, e-ticaret veya ERP entegrasyonu bağlayın." />

      <ul v-else class="bd__rows" aria-label="Kanal eşlemeleri">
        <BrandChannelRow v-for="ch in channels" :key="ch.code" :brand="brand" :channel="ch" @saved="onSaved" />
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EkButton, EkContextMenu, EkEmptyState } from '@entegrasyonik/ui/components'
import type { EkMenuItem } from '@entegrasyonik/ui/components'
import EkHelpHint from '@/components/page/EkHelpHint.vue'
import BrandChannelRow from '@/components/brands/BrandChannelRow.vue'
import './brands/brands.css'
import useRestApi from '@/composables/restapi'
import { useBrandsStore } from '@/stores/brandsStore'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useBrandChannels } from '@/composables/brandChannels'

const props = defineProps<{ brandId: string }>()
const emit = defineEmits<{ close: []; delete: [brand: any] }>()

const restApi = useRestApi()
const brandsStore = useBrandsStore()
const snackbarStore = useSnackbarStore()
const brandsRef = brandsStore.getBrands()
const { channels, mappableChannels, isMapped, summarize } = useBrandChannels()

// Canlı marka: mağazadaki nesne (kayıt sonrası yerel güncelleme + liste özeti aynı kaynaktan).
const brand = computed(() => (brandsRef.value ?? []).find((b: any) => b._id === props.brandId))
const mapped = computed(() => mappableChannels.value.filter((c) => isMapped(brand.value, c.code)))

const meta = computed(() => {
  const s = summarize(brand.value)
  if (!s.total) return { text: 'Bağlı kanal yok', tone: '' }
  if (!s.missing.length) return { text: `${s.mapped.length} kanalda eşli`, tone: 'is-ok' }
  if (!s.mapped.length) return { text: `Hiçbir kanalda eşli değil · ${s.missing.length} eksik`, tone: 'is-warn' }
  return { text: `${s.mapped.length} kanalda eşli · ${s.missing.length} eksik`, tone: 'is-warn' }
})

// Marka silinirse / bulunamazsa panel kapanır.
watch(brand, (b) => { if (!b && brandsRef.value) emit('close') })

const menuGroups = [{ items: [{ key: 'delete', label: 'Markayı sil', icon: 'mdi-trash-can-outline', danger: true }] }]
const onMenu = (item: EkMenuItem) => { if (item.key === 'delete') emit('delete', brand.value) }

// --- Satır içi ad düzenleme ---
const renaming = ref(false)
const renameSaving = ref(false)
const newTitle = ref<string | null>('')

const renameError = computed(() => {
  const v = (newTitle.value ?? '').trim()
  if (!v) return 'Marka adı boş olamaz.'
  if (v.length < 2 || v.length > 160) return 'Marka adı 2–160 karakter olmalı.'
  const dup = (brandsRef.value ?? []).some((b: any) => b._id !== props.brandId && (b.title ?? '').toLocaleLowerCase('tr') === v.toLocaleLowerCase('tr'))
  return dup ? 'Bu adda bir marka zaten var.' : ''
})

const startRename = () => { newTitle.value = brand.value?.title ?? ''; renaming.value = true }

const saveRename = async () => {
  if (renameError.value || renameSaving.value || !brand.value) return
  const title = (newTitle.value ?? '').trim()
  if (title === brand.value.title) { renaming.value = false; return }
  renameSaving.value = true
  const response = await restApi.post('BrandService/updateBrand', { brandId: brand.value._id, title })
  renameSaving.value = false
  if (response && response.result == true) {
    brand.value.title = title
    brandsStore.getBrands(true)
    snackbarStore.addSnackbar({ show: true, text: 'Marka güncellendi', timeout: 2000, color: 'success' })
    renaming.value = false
  } else {
    snackbarStore.addSnackbar({ show: true, text: 'Marka adı güncellenemedi — bağlantınızı kontrol edip tekrar deneyin.', timeout: 4000, color: 'error' })
  }
}

watch(() => props.brandId, () => { renaming.value = false })

// Kayıt sonrası yerel kopya hemen güncellenir (satır ✓ olur); liste özeti mağaza yenilemesiyle de gelir.
const onSaved = (code: string, value: any) => {
  if (!brand.value) return
  brand.value.platforms = { ...(brand.value.platforms || {}), [code]: value }
  brandsStore.getBrands(true)
}
</script>

<style scoped>
.bd {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--ek-color-surface);
}

.bd__head {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-4) var(--ek-space-4) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.bd__titlebox {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bd__titlerow {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-width: 0;
}

.bd__title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.bd__rename {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-1);
}

.bd__rename > :first-child {
  flex: 1;
  min-width: 0;
}

.bd__rename > .ek-btn {
  margin-top: 6px;
}

.bd__meta {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bd__meta.is-ok { color: var(--ek-color-success-emphasis); }
.bd__meta.is-warn { color: var(--ek-color-warning-emphasis); }

.bd__body {
  flex: 1;
  min-height: 0;
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-6);
  overflow-y: auto;
}

.bd__section-head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-2);
}

.bd__section-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
}

.bd__count {
  margin-right: auto;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bd__rows {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--ek-color-border-subtle);
  list-style: none;
}

@media (max-width: 599px) {
  .bd__head {
    padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-3) var(--ek-space-4);
  }

  .bd__body {
    padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-5);
  }
}
</style>
