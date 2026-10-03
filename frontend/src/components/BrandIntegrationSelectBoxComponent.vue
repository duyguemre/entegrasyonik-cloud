<!--
  Kanaldaki (pazaryeri/e-ticaret/ERP) markayı ARAYIP seçme alanı (marka eşlemesinin sağ tarafı).
  v-autocomplete: yazdıkça (en az 2 harf, kısa gecikmeyle) `IntegrationService/retrieveBrandsFromIntegration`
  çağrılır — istek gövdesi ve v-model biçimi ({ id, title }) DEĞİŞMEDİ.
  `prefill` (yerel marka adı) verilirse alan açılır açılmaz o adla aranır ve en iyi eşleşme "Önerilen" olarak
  alanın altında tek tıkla seçilebilir sunulur (tam ad eşleşmesi > içerme > ilk sonuç). Seçili marka listede kalır.
-->
<template>
  <div class="ek-brand-pick">
    <v-autocomplete
      v-model="selectedIntegrationBrand"
      v-model:search="searchText"
      :items="items"
      return-object
      item-value="id"
      item-title="title"
      no-filter
      variant="outlined"
      density="compact"
      autocomplete="off"
      hide-details="auto"
      :loading="searching"
      :rules="mandatory == true ? formRules.mandatoryRule : []"
      :label="`${channelTitle} markası`"
      placeholder="Marka adı yazarak arayın"
      @update:modelValue="emits('change', '')"
      @focus="($event.target as HTMLInputElement)?.select?.()"
    >
      <template #no-data>
        <div class="ek-brand-pick__empty">
          <v-icon icon="mdi-magnify" size="16" aria-hidden="true" />
          <span v-if="!searchText || searchText.length < 2">Aramak için en az 2 harf yazın</span>
          <span v-else-if="searching">Aranıyor…</span>
          <span v-else-if="failed">Sonuç alınamadı — kanal bağlantınızı kontrol edip tekrar arayın.</span>
          <span v-else>Bu aramayla marka bulunamadı — farklı bir yazım deneyin.</span>
        </div>
      </template>
    </v-autocomplete>

    <button v-if="suggestion" type="button" class="ek-brand-pick__suggest" @click="pickSuggestion()"
      :aria-label="`Önerilen ${channelTitle} markasını seç: ${suggestion.title}`">
      <v-icon icon="mdi-auto-fix" size="14" aria-hidden="true" />
      <span class="ek-brand-pick__suggest-label">Önerilen</span>
      <strong class="ek-brand-pick__suggest-name">{{ suggestion.title }}</strong>
      <span class="ek-brand-pick__suggest-act">Seç</span>
    </button>
  </div>
</template>

<script lang="ts" setup>
import { computed, watch, ref, onMounted, onBeforeUnmount } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore';
import useFormRules from '@/composables/formrules';

const integrationStore = useIntegrationStore()
const emits = defineEmits(['change'])

const selectedIntegrationBrand: any = defineModel({ default: undefined })
const props = defineProps<{
  withAll?: boolean,
  mandatory?: boolean,
  integrationCode: any,
  /** Yerel marka adı: alan bununla önden aranır ve öneri bununla eşlenir. */
  prefill?: string
}>()

const formRules: any = useFormRules()
const searchText = ref<string | undefined>('')
const results = ref<any[]>([])
const searching = ref(false)
const failed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

const channelTitle = computed(() => integrationStore.getIntegration(props.integrationCode)?.title ?? '')
const norm = (s: any) => String(s ?? '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '')

// "Önerilen": yerel marka adıyla en yakın sonuç.
const suggestion = computed(() => {
  const p = norm(props.prefill)
  if (!p || !results.value.length) return undefined
  const best = results.value.find((r: any) => norm(r.title) === p)
    ?? results.value.find((r: any) => norm(r.title).includes(p) || p.includes(norm(r.title)))
    ?? results.value[0]
  const sel: any = selectedIntegrationBrand.value
  return best && best.id != sel?.id ? best : undefined
})

// Seçili marka listede kalır; öneri en üstte durur.
const items = computed(() => {
  const sel: any = selectedIntegrationBrand.value
  const sug: any = suggestion.value
  let list = [...results.value]
  if (sug) list = [sug, ...list.filter((r: any) => r.id != sug.id)]
  if (sel?.id != null && !list.some((r: any) => r.id == sel.id)) list = [sel, ...list]
  return list
})

const pickSuggestion = () => {
  const s: any = suggestion.value
  if (!s) return
  selectedIntegrationBrand.value = s
  searchText.value = s.title
  emits('change', '')
}

const search = async () => {
  const text = searchText.value
  const selTitle = (selectedIntegrationBrand.value as any)?.title
  // Seçim yapılınca alan metni seçili adla dolar — bu yeni bir arama sayılmaz.
  if (!text || text.length < 2 || text === selTitle) {
    if (!text || text.length < 2) results.value = []
    searching.value = false
    return
  }
  const current = ++seq
  searching.value = true
  failed.value = false
  const response = await integrationStore.retrieveIntegrationBrands(props.integrationCode, text)
  if (current !== seq) return
  failed.value = !Array.isArray(response)
  results.value = Array.isArray(response) ? response : []
  searching.value = false
}

watch(searchText, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(search, 250)
})

watch(() => props.integrationCode, () => {
  results.value = []
  searchText.value = ''
  failed.value = false
})

onMounted(() => {
  // Henüz eşlemesi yoksa yerel marka adıyla önden ara (öneri üretmek için).
  if (props.prefill && !(selectedIntegrationBrand.value as any)?.id) searchText.value = props.prefill
})
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<style scoped>
.ek-brand-pick {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-brand-pick__empty {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-brand-pick__suggest {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  max-width: 100%;
  gap: var(--ek-space-2);
  min-height: 28px;
  padding: 0 var(--ek-space-3) 0 var(--ek-space-2);
  border: 1px dashed var(--ek-color-action-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-brand-pick__suggest:hover {
  border-style: solid;
}

.ek-brand-pick__suggest:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-brand-pick__suggest-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--ek-font-weight-semibold);
}

.ek-brand-pick__suggest-act {
  font-weight: var(--ek-font-weight-semibold);
}
</style>
