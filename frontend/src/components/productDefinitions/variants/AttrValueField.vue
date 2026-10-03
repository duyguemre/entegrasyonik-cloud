<!--
  Kanal özelliği DEĞER alanı — tek varyant ve toplu özellik diyaloglarında aynı. Serbest değer kabul eden özellikte
  combobox (yaz ya da seç), diğerlerinde aranabilir liste. Arama başa uyan ilk 200 değeri gösterir (binlerce değerli
  özelliklerde akıcı); seçili değer her zaman listede. Hiyerarşik değerler girintili, "Zorunlu" değerler etiketli.
  Değerleri istenince gelen özellik (lazyValues) menü açılınca `open` yayar.
  [eslesme-fiyat WP2, Ek C P1-1] Boş liste dört durumu AYIRIR (eskiden hepsi "Uyan değer yok"): yükleniyor / aramaya uyan yok /
  kanal değer döndürmedi [Tekrar dene] / kanal hatası [Tekrar dene]; özellik yerel seçeneğe eşli değilse [Eşlemeye git].
-->
<template>
  <v-combobox v-if="attribute.allowCustom" density="compact" variant="outlined" hide-details clearable no-filter return-object
    :items="items" item-title="title" item-value="id" :model-value="comboValue" :placeholder="placeholder"
    :aria-label="`${attribute.title} değeri`" :menu-props="{ maxHeight: 320 }" :loading="loading"
    @update:search="onSearch" @update:menu="(o: boolean) => o && emit('open')" @update:model-value="onPick">
    <template #item="{ item, props: ip }">
      <v-list-item v-bind="ip" :title="undefined" role="option"><span class="avf-opt" :class="`avf-opt--l${level(item.raw)}`">{{ (item.raw as any).title }}<span v-if="(item.raw as any).mandatory" class="avf-req">Zorunlu</span></span></v-list-item>
    </template>
    <template #no-data><div class="avf-empty">{{ loading ? t('channelAttributes.loading') : t('channelAttributes.customEmpty') }}</div></template>
  </v-combobox>
  <v-autocomplete v-else density="compact" variant="outlined" hide-details clearable no-filter
    :items="items" item-title="title" item-value="id" :model-value="modelValue?.attributeValueId || null" :placeholder="placeholder"
    :aria-label="`${attribute.title} değeri`" :menu-props="{ maxHeight: 320 }" :loading="loading"
    @update:search="onSearch" @update:menu="(o: boolean) => o && emit('open')" @update:model-value="onPick">
    <template #item="{ item, props: ip }">
      <v-list-item v-bind="ip" :title="undefined" role="option"><span class="avf-opt" :class="`avf-opt--l${level(item.raw)}`">{{ (item.raw as any).title }}<span v-if="(item.raw as any).mandatory" class="avf-req">Zorunlu</span></span></v-list-item>
    </template>
    <template #no-data>
      <div class="avf-empty" role="status">
        <span>{{ emptyText }}</span>
        <span v-if="emptyState === 'channelEmpty' || emptyState === 'channelError' || mapped === false" class="avf-actions">
          <button v-if="emptyState === 'channelEmpty' || emptyState === 'channelError'" type="button" class="avf-link" @click.stop="emit('retry')">{{ t('channelAttributes.retry') }}</button>
          <button v-if="mapped === false" type="button" class="avf-link" @click.stop="emit('goMapping')">{{ t('channelAttributes.goMapping') }}</button>
        </span>
      </div>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { attrOptions, toStoredAttr, valueEmptyState, type StoredAttr } from './channelAttributes'
import type { IntegrationErrorInfo } from '@/composables/useIntegrationError'

const props = withDefaults(defineProps<{
  attribute: any; modelValue?: StoredAttr; placeholder?: string; loading?: boolean
  /** Değer listesi yükleme hatası (yoksa boş liste = kanal değer döndürmedi). */
  error?: IntegrationErrorInfo
  /** Özellik yerel seçeneğe eşli mi; `false` iken "Eşlemeye git" görünür (undefined = bilinmiyor, gösterme). */
  mapped?: boolean
  channelTitle?: string
}>(), { placeholder: '' })
const emit = defineEmits<{ 'update:modelValue': [value: StoredAttr | null]; open: []; retry: []; goMapping: [] }>()
const { t } = useI18n()

const search = ref('')
// Seçili değerin metni arama kutusuna yazılınca liste süzülmesin (yalnız kullanıcı yazınca süz).
const effectiveQuery = computed(() => (search.value && search.value !== props.modelValue?.attributeValue ? search.value : ''))
const items = computed(() => attrOptions(props.attribute, effectiveQuery.value, props.modelValue?.attributeValueId))
const comboValue = computed(() => (props.modelValue
  ? (props.modelValue.attributeValueId ? { id: props.modelValue.attributeValueId, title: props.modelValue.attributeValue } : props.modelValue.attributeValue)
  : null))
const level = (raw: any) => Math.min(4, Number(raw?.level) || 0)
const emptyState = computed(() => valueEmptyState({ loading: !!props.loading, query: effectiveQuery.value, valueCount: props.attribute?.values?.length || 0, error: props.error }))
const emptyText = computed(() => {
  const channel = props.channelTitle || ''
  switch (emptyState.value) {
    case 'loading': return t('channelAttributes.loading')
    case 'noMatch': return t('channelAttributes.noMatch')
    case 'channelError': return t('channelAttributes.channelError', { channel, cause: props.error?.cause || props.error?.title || '' })
    default: return t('channelAttributes.channelEmpty', { channel })
  }
})
function onSearch(q: string) { search.value = q || '' }
function onPick(v: any) { emit('update:modelValue', toStoredAttr(props.attribute, v)) }
</script>

<style scoped>
.avf-opt { display: inline-flex; align-items: center; gap: var(--ek-space-2); }
.avf-opt--l1 { padding-left: var(--ek-space-4); }
.avf-opt--l2 { padding-left: var(--ek-space-8); }
.avf-opt--l3, .avf-opt--l4 { padding-left: var(--ek-space-12, 48px); }
.avf-req {
  display: inline-flex;
  padding: 0 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: 600;
  line-height: 18px;
}
.avf-empty { display: flex; flex-direction: column; gap: var(--ek-space-1); padding: var(--ek-space-3) var(--ek-space-4); color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); }
.avf-actions { display: inline-flex; gap: var(--ek-space-3); }
.avf-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ek-color-primary);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
.avf-link:focus-visible { outline: 2px solid var(--ek-color-border-focus); outline-offset: 2px; }
</style>
