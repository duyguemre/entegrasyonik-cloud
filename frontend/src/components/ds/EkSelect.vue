<!--
  frontend/src/components/ds/EkSelect.vue

  DS-v2 Aşama 6b — Standart 12: SEÇİM / OTOMATİK TAMAMLAMA açılır listesi (mevcut Vuetify yapısının ÜZERİNE).
  Kullanıldığı yere özel seçim deneyimi, tek bileşenden:
    • `kind="channel"`: kanal renginde nokta + ad (+ tür alt satırı) · seçimde kanal renkli çip
    • `kind="status"` : ton renginde nokta (`tone`) · aynı dil çiplerde
    • `subtitle` ikinci satır, `icon`, `group` başlıkları (seçilemez), `recent-key` → "Son kullanılanlar"
    • arama (`searchable` ya da 8+ seçenek → otomatik tamamlama) + eşleşme vurgusu (<mark>)
    • çoklu seçimde başlık şeridi: "n / m seçili" · Tümünü seç · Temizle; çiplerde 2'den fazlası "+n"
    • boş ve yükleniyor durumu (metinli), klavye: Vuetify listbox (↑↓ Enter Esc, yazarak ara)
  Tüm diğer özellikler ($attrs: label, clearable, hide-details, error-messages …) alttaki bileşene geçer.
-->
<template>
  <v-autocomplete
    v-if="isSearchable"
    v-bind="$attrs"
    v-model:search="search"
    :model-value="modelValue"
    :items="menu"
    item-title="title"
    item-value="value"
    :item-props="itemProps"
    :multiple="multiple"
    :chips="multiple"
    :closable-chips="multiple"
    :loading="loading"
    :no-data-text="loading ? 'Yükleniyor…' : emptyText"
    :class="['ek-select', `ek-select--${kind}`]"
    :menu-props="{ contentClass: 'ek-select-menu' }"
    @update:model-value="onUpdate"
  >
    <template v-if="multiple && options.length > 1" #prepend-item>
      <div class="ek-select-menu__bulk">
        <span class="ek-select-menu__count ek-num">{{ selectedCount }} / {{ options.length }} seçili</span>
        <button type="button" class="ek-select-menu__link" @click="selectAll">Tümünü seç</button>
        <button type="button" class="ek-select-menu__link" :disabled="!selectedCount" @click="clearAll">Temizle</button>
      </div>
    </template>
    <template #item="{ props: ip, item }">
      <v-list-subheader v-if="item.raw.__header" role="presentation" class="ek-select-menu__group">{{ item.raw.title }}</v-list-subheader>
      <v-list-item v-else v-bind="ip" role="option" :title="undefined" class="ek-select-menu__item">
        <template #prepend="{ isSelected }">
          <v-checkbox-btn v-if="multiple" :model-value="isSelected" density="compact" tabindex="-1" class="ek-select-menu__check" />
          <span v-if="item.raw.channel !== undefined" class="ek-select-menu__dot" :class="channelClass(item.raw.channel)" aria-hidden="true"></span>
          <span v-else-if="item.raw.tone" class="ek-select-menu__dot" :class="`is-${item.raw.tone}`" aria-hidden="true"></span>
          <v-icon v-else-if="item.raw.icon" class="ek-select-menu__icon" :icon="item.raw.icon" aria-hidden="true" />
        </template>
        <v-list-item-title class="ek-select-menu__title">
          <template v-for="(p, i) in splitMatch(item.raw.title, search)" :key="i"><mark v-if="p.match">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template>
        </v-list-item-title>
        <v-list-item-subtitle v-if="item.raw.subtitle" class="ek-select-menu__sub">{{ item.raw.subtitle }}</v-list-item-subtitle>
      </v-list-item>
    </template>
    <template #chip="{ props: cp, item, index }">
      <v-chip v-if="index < maxChips" v-bind="cp" :class="['ek-select__chip', item.raw.channel !== undefined ? channelClass(item.raw.channel) : '']">
        <span v-if="item.raw.channel !== undefined" class="ek-select__chip-dot" aria-hidden="true"></span>{{ item.raw.title }}
      </v-chip>
      <span v-else-if="index === maxChips" class="ek-select__more ek-num">+{{ selectedCount - maxChips }}</span>
    </template>
  </v-autocomplete>
  <v-select
    v-else
    v-bind="$attrs"
    :model-value="modelValue"
    :items="menu"
    item-title="title"
    item-value="value"
    :item-props="itemProps"
    :multiple="multiple"
    :chips="multiple"
    :closable-chips="multiple"
    :loading="loading"
    :no-data-text="loading ? 'Yükleniyor…' : emptyText"
    :class="['ek-select', `ek-select--${kind}`]"
    :menu-props="{ contentClass: 'ek-select-menu' }"
    @update:model-value="onUpdate"
  >
    <template v-if="multiple && options.length > 1" #prepend-item>
      <div class="ek-select-menu__bulk">
        <span class="ek-select-menu__count ek-num">{{ selectedCount }} / {{ options.length }} seçili</span>
        <button type="button" class="ek-select-menu__link" @click="selectAll">Tümünü seç</button>
        <button type="button" class="ek-select-menu__link" :disabled="!selectedCount" @click="clearAll">Temizle</button>
      </div>
    </template>
    <template #item="{ props: ip, item }">
      <v-list-subheader v-if="item.raw.__header" role="presentation" class="ek-select-menu__group">{{ item.raw.title }}</v-list-subheader>
      <v-list-item v-else v-bind="ip" role="option" :title="undefined" class="ek-select-menu__item">
        <template #prepend="{ isSelected }">
          <v-checkbox-btn v-if="multiple" :model-value="isSelected" density="compact" tabindex="-1" class="ek-select-menu__check" />
          <span v-if="item.raw.channel !== undefined" class="ek-select-menu__dot" :class="channelClass(item.raw.channel)" aria-hidden="true"></span>
          <span v-else-if="item.raw.tone" class="ek-select-menu__dot" :class="`is-${item.raw.tone}`" aria-hidden="true"></span>
          <v-icon v-else-if="item.raw.icon" class="ek-select-menu__icon" :icon="item.raw.icon" aria-hidden="true" />
        </template>
        <v-list-item-title class="ek-select-menu__title">{{ item.raw.title }}</v-list-item-title>
        <v-list-item-subtitle v-if="item.raw.subtitle" class="ek-select-menu__sub">{{ item.raw.subtitle }}</v-list-item-subtitle>
      </v-list-item>
    </template>
    <template #chip="{ props: cp, item, index }">
      <v-chip v-if="index < maxChips" v-bind="cp" :class="['ek-select__chip', item.raw.channel !== undefined ? channelClass(item.raw.channel) : '']">
        <span v-if="item.raw.channel !== undefined" class="ek-select__chip-dot" aria-hidden="true"></span>{{ item.raw.title }}
      </v-chip>
      <span v-else-if="index === maxChips" class="ek-select__more ek-num">+{{ selectedCount - maxChips }}</span>
    </template>
  </v-select>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { channelClass } from '@/design/channels'
import { buildMenu, normalizeOptions, pushRecent, readRecent, splitMatch, type EkMenuRow } from './selectOptions'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    modelValue?: any
    items: any[]
    itemTitle?: string
    itemValue?: string
    kind?: 'default' | 'channel' | 'status'
    multiple?: boolean
    /** Arama kutusu; verilmezse 8+ seçenekte açılır. */
    searchable?: boolean
    /** Son kullanılanlar için ekran/alan anahtarı (yerel depo). */
    recentKey?: string
    loading?: boolean
    emptyText?: string
    /** Çoklu seçimde gösterilen en çok çip (fazlası "+n"). */
    maxChips?: number
  }>(),
  { itemTitle: 'title', itemValue: 'value', kind: 'default', multiple: false, searchable: undefined, loading: false, emptyText: 'Seçenek yok', maxChips: 2 },
)
const emit = defineEmits<{ 'update:modelValue': [value: any] }>()

const search = ref('')
const recent = ref(readRecent(props.recentKey))
const options = computed(() => normalizeOptions(props.items, props.itemTitle, props.itemValue, props.kind))
const menu = computed(() => buildMenu(options.value, recent.value))
const isSearchable = computed(() => props.searchable ?? options.value.length >= 8)
const selectedCount = computed(() => (Array.isArray(props.modelValue) ? props.modelValue.length : props.modelValue != null && props.modelValue !== '' ? 1 : 0))

const itemProps = (row: EkMenuRow) => (row.__header ? { disabled: true, title: row.title } : { title: row.title, disabled: row.disabled })

function onUpdate(value: any) {
  emit('update:modelValue', value)
  const picked = Array.isArray(value) ? value : value == null ? [] : [value]
  if (props.recentKey && picked.length) recent.value = pushRecent(props.recentKey, picked.slice(-1))
}

function selectAll() {
  emit('update:modelValue', options.value.filter((o) => !o.disabled).map((o) => o.value))
}

function clearAll() {
  emit('update:modelValue', [])
}
</script>

<style>
/* Açılır liste teleport edilir → scoped değil; `.ek-select-menu` ile sınırlı. */
.ek-select-menu .ek-select-menu__bulk {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  position: sticky;
  top: 0;
  z-index: 1;
}

.ek-select-menu .ek-select-menu__count {
  flex: 1 1 auto;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
}

.ek-select-menu .ek-select-menu__link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-action);
  cursor: pointer;
  border-radius: var(--ek-radius-sm);
}

.ek-select-menu .ek-select-menu__link:disabled {
  color: var(--ek-color-content-subtle);
  cursor: default;
}

.ek-select-menu .ek-select-menu__link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-select-menu .ek-select-menu__group {
  min-height: 28px;
  padding-inline: var(--ek-space-4);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-select-menu .ek-select-menu__item .v-list-item__prepend {
  gap: var(--ek-space-2);
}

.ek-select-menu .ek-select-menu__item .v-list-item__prepend > .v-list-item__spacer {
  width: var(--ek-space-2);
}

.ek-select-menu .ek-select-menu__check {
  margin-inline-start: calc(var(--ek-space-2) * -1);
}

.ek-select-menu .ek-select-menu__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-solid, var(--ek-color-border-strong));
}

.ek-select-menu .ek-select-menu__dot.is-success { background: var(--ek-color-success); }
.ek-select-menu .ek-select-menu__dot.is-warning { background: var(--ek-color-warning); }
.ek-select-menu .ek-select-menu__dot.is-danger { background: var(--ek-color-error); }
.ek-select-menu .ek-select-menu__dot.is-info { background: var(--ek-color-info); }
.ek-select-menu .ek-select-menu__dot.is-action { background: var(--ek-color-action); }
.ek-select-menu .ek-select-menu__dot.is-neutral { background: var(--ek-color-neutral); }

.ek-select-menu .ek-select-menu__icon {
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-muted);
}

.ek-select-menu .ek-select-menu__title {
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-strong);
}

.ek-select-menu .ek-select-menu__title mark {
  background: var(--ek-color-highlight);
  color: inherit;
  border-radius: 2px;
}

.ek-select-menu .ek-select-menu__sub {
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
  opacity: 1;
}

.ek-select .ek-select__chip.v-chip {
  gap: 6px;
}

.ek-select .ek-select__chip.v-chip[class*='ek-ch-'] {
  background: var(--ek-ch-subtle);
  border: 1px solid var(--ek-ch-border);
  color: var(--ek-ch-text);
}

.ek-select .ek-select__chip-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-solid);
}

.ek-select .ek-select__more {
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
  padding-inline: var(--ek-space-1);
}
</style>
