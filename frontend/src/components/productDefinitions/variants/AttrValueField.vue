<!--
  Kanal özelliği DEĞER alanı — tek varyant ve toplu özellik diyaloglarında aynı. Serbest değer kabul eden özellikte
  combobox (yaz ya da seç), diğerlerinde aranabilir liste. Arama başa uyan ilk 200 değeri gösterir (binlerce değerli
  özelliklerde akıcı); seçili değer her zaman listede. Hiyerarşik değerler girintili, "Zorunlu" değerler etiketli.
  Değerleri istenince gelen özellik (lazyValues) menü açılınca `open` yayar.
-->
<template>
  <v-combobox v-if="attribute.allowCustom" density="compact" variant="outlined" hide-details clearable no-filter return-object
    :items="items" item-title="title" item-value="id" :model-value="comboValue" :placeholder="placeholder"
    :aria-label="`${attribute.title} değeri`" :menu-props="{ maxHeight: 320 }" :loading="loading"
    @update:search="onSearch" @update:menu="(o: boolean) => o && emit('open')" @update:model-value="onPick">
    <template #item="{ item, props: ip }">
      <v-list-item v-bind="ip" :title="undefined" role="option"><span class="avf-opt" :class="`avf-opt--l${level(item.raw)}`">{{ (item.raw as any).title }}<span v-if="(item.raw as any).mandatory" class="avf-req">Zorunlu</span></span></v-list-item>
    </template>
    <template #no-data><div class="avf-empty">{{ loading ? 'Değerler yükleniyor…' : 'Değer yok — yazarak ekleyin' }}</div></template>
  </v-combobox>
  <v-autocomplete v-else density="compact" variant="outlined" hide-details clearable no-filter
    :items="items" item-title="title" item-value="id" :model-value="modelValue?.attributeValueId || null" :placeholder="placeholder"
    :aria-label="`${attribute.title} değeri`" :menu-props="{ maxHeight: 320 }" :loading="loading"
    @update:search="onSearch" @update:menu="(o: boolean) => o && emit('open')" @update:model-value="onPick">
    <template #item="{ item, props: ip }">
      <v-list-item v-bind="ip" :title="undefined" role="option"><span class="avf-opt" :class="`avf-opt--l${level(item.raw)}`">{{ (item.raw as any).title }}<span v-if="(item.raw as any).mandatory" class="avf-req">Zorunlu</span></span></v-list-item>
    </template>
    <template #no-data><div class="avf-empty">{{ loading ? 'Değerler yükleniyor…' : 'Uyan değer yok' }}</div></template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { attrOptions, toStoredAttr, type StoredAttr } from './channelAttributes'

const props = withDefaults(defineProps<{ attribute: any; modelValue?: StoredAttr; placeholder?: string; loading?: boolean }>(), { placeholder: '' })
const emit = defineEmits<{ 'update:modelValue': [value: StoredAttr | null]; open: [] }>()

const search = ref('')
// Seçili değerin metni arama kutusuna yazılınca liste süzülmesin (yalnız kullanıcı yazınca süz).
const effectiveQuery = computed(() => (search.value && search.value !== props.modelValue?.attributeValue ? search.value : ''))
const items = computed(() => attrOptions(props.attribute, effectiveQuery.value, props.modelValue?.attributeValueId))
const comboValue = computed(() => (props.modelValue
  ? (props.modelValue.attributeValueId ? { id: props.modelValue.attributeValueId, title: props.modelValue.attributeValue } : props.modelValue.attributeValue)
  : null))
const level = (raw: any) => Math.min(4, Number(raw?.level) || 0)
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
.avf-empty { padding: var(--ek-space-3) var(--ek-space-4); color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); }
</style>
