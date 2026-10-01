<!--
  frontend/src/components/categories/CategoryChannelRow.vue

  Bir YAPRAK kategorinin TEK kanaldaki eşlemesi (detay panelinin "Kanal eşlemeleri" listesinde bir satır):
    [kanal rozeti]  [eşliyse kanaldaki kategori YOLU + ✓ / değilse soluk "Eşlenmedi"]  [Eşle / Değiştir]
  "Eşle" satırı yerinde genişletir (ChannelCategoryPicker: arama + öneri + ağaçtan seç); Kaydet / Vazgeç, durum
  (kaydediliyor / hata) satır içinde. Eşliyse altında katlanır "Özellikler (n zorunlu, m eşli)" bölümü: kanal
  kategorisinin özellikleri; "Eşle" → mevcut Seçenek Eşleştirme diyaloğu (ChoicesMappingComponent).
  İstek gövdeleri eski ekranla AYNI: AttributeMappingService/saveCategoryMapping { localCategoryId, integrationCode,
  platformCategoryId }; özellik/değer listeleri integrationStore.loadIntegrationCategoryChoices / ...AttributeValues.
-->
<template>
  <li class="ccr" :class="{ 'is-open': editing }" :data-channel="channel.code">
    <div class="ccr__main">
      <EkChannelBadge :id="nameId" :code="channel.code" :name="channel.title" size="sm" />
      <div class="ccr__state">
        <span v-if="!ready" class="ccr__skeleton" aria-hidden="true" />
        <template v-else-if="mappedId">
          <v-icon icon="mdi-check-circle-outline" size="16" class="ccr__ok" aria-hidden="true" />
          <span class="ccr__path" :title="mappedPath || undefined">{{ mappedPath || `Kategori ${mappedId}` }}</span>
          <span class="ek-sr-only">eşli</span>
        </template>
        <span v-else class="ccr__none">Eşlenmedi</span>
      </div>
      <EkButton v-if="ready" :tone="mappedId ? 'ghost' : 'secondary'" size="sm" :aria-expanded="editing" :aria-describedby="nameId"
        @click="editing ? cancel() : startEdit()">{{ editing ? 'Kapat' : mappedId ? 'Değiştir' : 'Eşle' }}</EkButton>
    </div>

    <div v-if="editing" class="ccr__edit">
      <ChannelCategoryPicker v-model="picked" :integration-code="channel.code" :local-title="category.title" />
      <p v-if="mappedId && picked != undefined && String(picked) !== mappedId" class="ccr__warn">
        <v-icon icon="mdi-alert-circle-outline" size="16" aria-hidden="true" />
        <span>Kanal kategorisi değişirse bu kategorinin özellik eşlemeleri silinir.</span>
      </p>
      <p v-if="saveError" class="ccr__error" role="alert">
        <v-icon icon="mdi-alert-circle-outline" size="16" aria-hidden="true" />
        <span>{{ saveError }}</span>
      </p>
      <div class="ccr__actions">
        <EkButton tone="ghost" size="sm" :disabled="saving" @click="cancel">Vazgeç</EkButton>
        <EkButton tone="primary" size="sm" icon="mdi-content-save-outline" :loading="saving"
          :disabled="picked == undefined || (mappedId != undefined && String(picked) === mappedId)" @click="save">Kaydet</EkButton>
      </div>
    </div>

    <div v-else-if="mappedId" class="ccr__attrs">
      <button type="button" class="ccr__disclosure" :aria-expanded="attrsOpen" :aria-controls="attrsId" @click="toggleAttrs">
        <v-icon :icon="attrsOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="16" aria-hidden="true" />
        <span>Özellikler</span>
        <span class="ccr__attrs-sum ek-num">{{ attrsSummary }}</span>
      </button>
      <div v-if="attrsOpen" :id="attrsId" class="ccr__attrs-body">
        <IntegrationLoadingBlock v-if="choicesLoad.status.value === 'loading' && !choicesLoad.error.value"
          :label="`${channel.title} kategori özellikleri alınıyor…`" />
        <IntegrationErrorPanel v-else-if="choicesLoad.error.value" :info="choicesLoad.error.value"
          :retrying="choicesLoad.loading.value" @retry="loadChoices" />
        <p v-else-if="!choices.length" class="ccr__hint">Bu kanal kategorisi için özellik listesi boş.</p>
        <ul v-else class="ccr__attr-list" :aria-label="`${channel.title} özellikleri`">
          <li v-for="c in choices" :key="c._id" class="ccr__attr">
            <EkBadge :tone="kind(c).tone">{{ kind(c).label }}</EkBadge>
            <span class="ccr__attr-title" :class="{ 'is-strong': c.slicer || c.varianter }">{{ c.title }}</span>
            <v-icon v-if="c.required" icon="mdi-asterisk" size="12" class="ccr__req" aria-label="Zorunlu" />
            <span class="ccr__attr-state" :class="{ 'is-ok': isAttrMapped(c) }">{{ isAttrMapped(c) ? 'Eşli' : 'Eşlenmedi' }}</span>
            <EkButton tone="ghost" size="sm" :aria-label="`${c.title} özelliğini ${isAttrMapped(c) ? 'düzenle' : 'eşle'}`"
              @click="openAttr(c)">{{ isAttrMapped(c) ? 'Düzenle' : 'Eşle' }}</EkButton>
          </li>
        </ul>
      </div>
    </div>

    <EkDialogHost :model-value="mappingOpen" attach=".cat-manager" width="xl" @update:model-value="(v: boolean) => { if (!v) closeAttr() }">
      <keep-alive>
        <ChoicesMappingComponent v-if="mappingOpen" v-model="mappingOpen" key="ChoicesMappingComponent" :integrationCode="channel.code"
          :integrationCategoryId="mappedId" :integrationChoice="activeChoice" :localCategoryId="category.id"
          :valuesError="valuesLoad.error.value" :valuesLoading="valuesLoad.loading.value" @retryValues="fetchValues"
          @close="closeAttr" />
      </keep-alive>
    </EkDialogHost>
  </li>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { EkBadge, EkButton, EkChannelBadge, EkDialogHost } from '@entegrasyonik/ui/components'
import ChannelCategoryPicker from '@/components/categories/ChannelCategoryPicker.vue'
import ChoicesMappingComponent from '@/components/ChoicesMappingComponent.vue'
import IntegrationErrorPanel from '@/components/integrations/IntegrationErrorPanel.vue'
import IntegrationLoadingBlock from '@/components/integrations/IntegrationLoadingBlock.vue'
import { useIntegrationLoad } from '@/composables/useIntegrationError'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useAttributeMappingStore } from '@/stores/site/attributeMapping'
import { useSnackbarStore } from '@/stores/snackbarStore'
import useRestApi from '@/composables/restapi'
import { channelIndexFor } from '@/composables/channelCategoryIndex'
import type { CatNode } from '@/composables/categoryTree'

const props = defineProps<{
  channel: { code: string; title: string }
  category: CatNode
  /** Kanaldaki eşli kategori kimliği (yoksa `undefined`). */
  mappedId?: string
  /** Eşleme verisi yüklendi mi (yüklenmeden "Eşlenmedi" gösterilmez). */
  ready: boolean
}>()
const emit = defineEmits<{ saved: [] }>()

const nameId = `ccr-name-${useId()}`
const attrsId = `ccr-attrs-${useId()}`
const restApi = useRestApi()
const integrationStore = useIntegrationStore()
const attributeMappingStore = useAttributeMappingStore()
const snackbarStore = useSnackbarStore()

const editing = ref(false)
const picked = ref<string | number | undefined>(undefined)
const saving = ref(false)
const saveError = ref('')

// Eşli kategorinin kanal yolu (kanal listesi mağazada önbelleklidir; yüklenemezse kimlik gösterilir).
const mappedPath = ref('')
watch(() => [props.mappedId, props.channel.code] as const, async ([id, code]) => {
  mappedPath.value = ''
  if (!id) return
  const res = await integrationStore.loadIntegrationCategories(code)
  if (res.ok && props.mappedId === id) mappedPath.value = channelIndexFor(res.data as any[]).pathText(id)
}, { immediate: true })

function startEdit() {
  saveError.value = ''
  picked.value = undefined
  editing.value = true
}
function cancel() {
  editing.value = false
  saveError.value = ''
}

async function save() {
  if (picked.value == undefined) return
  saving.value = true
  saveError.value = ''
  try {
    const response: any = await restApi.post('AttributeMappingService/saveCategoryMapping', {
      localCategoryId: props.category.id,
      integrationCode: props.channel.code,
      platformCategoryId: picked.value,
    })
    if (response && response.result) {
      snackbarStore.addSnackbar({ show: true, text: `${props.channel.title} kategori eşleşmesi kaydedildi.`, timeout: 3000, color: 'success' })
      await attributeMappingStore.retrieveAttributeMappings()
      editing.value = false
      emit('saved')
    } else {
      saveError.value = `${props.channel.title} eşleşmesi kaydedilemedi — bağlantınızı kontrol edip tekrar deneyin.`
    }
  } catch {
    saveError.value = `${props.channel.title} eşleşmesi kaydedilemedi — bağlantınızı kontrol edip tekrar deneyin.`
  } finally {
    saving.value = false
  }
}

// ---- Özellikler -------------------------------------------------------------------------------------------------------
const attrsOpen = ref(false)
const choices = ref<any[]>([])
const choicesLoaded = ref(false)
const choicesLoad = useIntegrationLoad(() => integrationStore.loadIntegrationCategoryChoices(props.channel.code, props.mappedId as any))

watch(() => props.mappedId, () => { choices.value = []; choicesLoaded.value = false; choicesLoad.reset(); if (attrsOpen.value) loadChoices() })

async function loadChoices() {
  if (!props.mappedId) return
  const result = await choicesLoad.run()
  if (result.ok) {
    choices.value = [...result.data].sort((a: any, b: any) => {
      const sa = a.slicer ? 2 : a.varianter ? 1 : 0
      const sb = b.slicer ? 2 : b.varianter ? 1 : 0
      return sa !== sb ? sb - sa : String(a.title ?? '').localeCompare(String(b.title ?? ''), 'tr')
    })
    choicesLoaded.value = true
  } else choices.value = []
}
function toggleAttrs() {
  attrsOpen.value = !attrsOpen.value
  if (attrsOpen.value && !choicesLoaded.value) loadChoices()
}

const kind = (c: any): { label: string; tone: 'info' | 'warning' | 'neutral' } =>
  c?.slicer ? { label: 'Ürün bölen', tone: 'info' } : c?.varianter ? { label: 'Varyant', tone: 'warning' } : { label: 'Nitelik', tone: 'neutral' }

/** Bu yerel kategori + kanal için kayıtlı özellik eşlemeleri (platformAttributeId dolu, yerel seçenek grubu atanmış). */
const attrDocs = computed(() => (attributeMappingStore.mappings ?? []).filter((m: any) =>
  String(m.localCategoryId) === props.category.id && m.integrationCode === props.channel.code && m.platformAttributeId != null && m.localChoiceId))
const isAttrMapped = (c: any) => attrDocs.value.some((m: any) => String(m.platformAttributeId) === String(c._id))

const attrsSummary = computed(() => {
  const mapped = attrDocs.value.length
  if (!choicesLoaded.value) return `· ${mapped} eşli`
  const required = choices.value.filter((c: any) => c.required).length
  const mappedOfListed = choices.value.filter(isAttrMapped).length
  return `(${required} zorunlu, ${mappedOfListed} eşli)`
})

// ---- Seçenek (özellik) eşleştirme diyaloğu (eski akışla aynı bileşen ve girdiler) ---------------------------------------
const mappingOpen = ref(false)
const activeChoice = ref<any>(undefined)
const valuesLoad = useIntegrationLoad(() =>
  integrationStore.loadIntegrationCategoryAttributeValues(props.channel.code, props.mappedId as any, activeChoice.value._id))

async function fetchValues() {
  const target = activeChoice.value
  if (!target || target.allowCustom) return
  // Değerler zaten gömülü geldiyse (ör. N11) yeniden çekilmez.
  if (target.values && target.values.length > 0) return
  const result = await valuesLoad.run()
  if (result.ok && activeChoice.value === target) target.values = result.data
}
async function openAttr(c: any) {
  valuesLoad.reset()
  activeChoice.value = c
  mappingOpen.value = true
  await fetchValues()
}
async function closeAttr() {
  mappingOpen.value = false
  activeChoice.value = undefined
  await attributeMappingStore.retrieveAttributeMappings()
}
</script>

<style scoped>
.ccr {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) 0;
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ccr:last-child {
  border-bottom: 0;
}

.ccr__main {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: var(--ek-control-h-md);
}

.ccr__main > :first-child {
  flex: none;
  min-width: 96px;
  justify-content: center;
}

.ccr__state {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
  font-size: var(--ek-type-body-size);
}

.ccr__ok {
  flex: none;
  color: var(--ek-color-success-emphasis);
}

.ccr__path {
  min-width: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ccr__none {
  color: var(--ek-color-content-subtle);
}

.ccr__skeleton {
  width: 160px;
  height: 12px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.ccr__edit {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}

.ccr__warn,
.ccr__error {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ccr__warn {
  color: var(--ek-color-warning-emphasis);
}

.ccr__error {
  color: var(--ek-color-error-emphasis);
}

.ccr__warn .v-icon,
.ccr__error .v-icon {
  flex: none;
}

.ccr__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ek-space-2);
}

.ccr__attrs {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding-inline-start: calc(96px + var(--ek-space-3));
}

.ccr__disclosure {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  align-self: flex-start;
  min-height: 28px;
  padding: 0 var(--ek-space-2) 0 var(--ek-space-1);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: none;
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ccr__disclosure:hover {
  background: var(--ek-color-surface-muted);
}

.ccr__disclosure:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ccr__attrs-sum {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.ccr__hint {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ccr__attr-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ccr__attr {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: var(--ek-control-h-md);
  padding: var(--ek-space-1) 0;
  border-top: 1px solid var(--ek-color-border-subtle);
  font-size: var(--ek-type-caption-size);
}

.ccr__attr:first-child {
  border-top: 0;
}

.ccr__attr-title {
  min-width: 0;
  overflow: hidden;
  color: var(--ek-color-content-default);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ccr__attr-title.is-strong {
  font-weight: var(--ek-font-weight-semibold);
}

.ccr__req {
  flex: none;
  color: var(--ek-color-error);
}

.ccr__attr-state {
  margin-inline-start: auto;
  color: var(--ek-color-content-subtle);
}

.ccr__attr-state.is-ok {
  color: var(--ek-color-success-emphasis);
}

@media (max-width: 599px) {
  .ccr__attrs {
    padding-inline-start: 0;
  }

  .ccr__main {
    flex-wrap: wrap;
  }

  .ccr__main > .ek-btn {
    order: 2;
    margin-inline-start: auto;
  }

  .ccr__state {
    flex: 1 1 100%;
    order: 3;
  }
}
</style>
