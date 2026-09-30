<!--
  frontend/src/components/adminPanel/integrations/SettingField.vue

  ADR-0020 Karar 4.2 — "Alan anatomisi" (tek bileşen, katalog tanımından üretilir). Etiket (sade TR) +
  bir satır açıklama + "?" ile genişleyen etki notu + birim son eki + "Varsayılan: X" + "Etkin: Y ·
  kaynak" + tehlike rozeti (`EkStatusChip`, `safe` rozet göstermez) + uygulanma rozeti + "Varsayılana
  dön" + env-kilit devre dışı gösterimi + güvenli aralık dışı satır içi uyarı. Anahtar adı yalnızca
  "Gelişmiş bilgi" katlı bölümünde, kopyalanabilir biçimde görünür (Karar 4.3).

  NOT (bkz. `settingsCatalogMirror.ts` dosya başı): `meta` katalog METAVERİSİDİR (label/help/danger/
  unit/...), backend'den GELMEZ (uç yok) — GEÇİCİ frontend aynası. `resolved` ise gerçek RPC yanıtıdır
  (`platform.integrationConfig.get` → `values[]`).
-->
<template>
  <div class="setting-field" :class="{ 'setting-field--readonly': readonly }">
    <div class="setting-field__label-row">
      <span class="setting-field__label">{{ meta.label.tr }}</span>
      <EkStatusChip v-if="dangerEntry" :tone="dangerEntry.tone" :label="dangerLabel" />
      <button
        v-if="meta.impact"
        type="button"
        class="setting-field__impact-toggle"
        :aria-expanded="showImpact"
        :aria-label="showImpact ? 'Etki notunu gizle' : 'Etki notunu göster'"
        @click="showImpact = !showImpact"
      >?</button>
    </div>
    <p class="setting-field__help">{{ meta.help.tr }}</p>
    <p v-if="showImpact && meta.impact" class="setting-field__impact">{{ meta.impact.tr }}</p>

    <div class="setting-field__control">
      <v-switch
        v-if="meta.type === 'bool'"
        :model-value="!!modelValue"
        color="primary"
        density="comfortable"
        hide-details
        :disabled="readonly"
        :label="modelValue ? 'Açık' : 'Kapalı'"
        @update:model-value="(v: boolean | null) => emit('update:modelValue', !!v)"
      />
      <v-text-field
        v-else-if="meta.type === 'int' || meta.type === 'duration'"
        type="number"
        hide-details="auto"
        :model-value="modelValue"
        :disabled="readonly"
        :suffix="unitSuffix"
        :aria-label="meta.label.tr"
        @update:model-value="onNumberInput"
      />
      <v-textarea
        v-else-if="meta.type === 'stringList'"
        :model-value="stringListDisplay"
        hide-details="auto"
        readonly
        :aria-label="meta.label.tr"
        rows="2"
      />
      <v-text-field
        v-else
        hide-details="auto"
        :model-value="modelValue"
        :disabled="readonly"
        :aria-label="meta.label.tr"
        @update:model-value="(v: string) => emit('update:modelValue', v)"
      />
    </div>

    <div class="setting-field__meta-row">
      <span class="setting-field__default">Varsayılan: {{ defaultDisplay }}</span>
      <span class="setting-field__effective">Etkin: {{ effectiveDisplay }} · {{ sourceLabel }}</span>
      <EkStatusChip tone="neutral" :label="appliesLabel" />
      <button v-if="isOverridden" type="button" class="setting-field__reset" @click="emit('reset')">
        Varsayılana dön
      </button>
    </div>

    <p v-if="envLocked" class="setting-field__lock-note">
      <v-icon icon="mdi-lock-outline" size="14" aria-hidden="true" />
      <code>{{ meta.envLock }}</code> ortam değişkeniyle kilitli — panelden değiştirilemez.
    </p>
    <p v-else-if="!meta.overridable" class="setting-field__lock-note">
      <v-icon icon="mdi-eye-outline" size="14" aria-hidden="true" />
      Bu ayar şu an panelden değiştirilemez (salt-okunur).
    </p>
    <p v-if="outOfSafeRange" class="setting-field__range-warning" role="alert">
      <v-icon icon="mdi-alert-outline" size="14" aria-hidden="true" />
      Önerilen aralık {{ meta.safeRange!.min }}–{{ meta.safeRange!.max }}. Bu değer tehlikeli değişiklik onayı gerektirir.
    </p>

    <button type="button" class="setting-field__advanced-toggle" @click="showAdvanced = !showAdvanced" :aria-expanded="showAdvanced">
      {{ showAdvanced ? 'Gelişmiş bilgiyi gizle' : 'Gelişmiş bilgi' }}
    </button>
    <div v-if="showAdvanced" class="setting-field__advanced">
      <span>Anahtar:</span>
      <code>{{ meta.key }}</code>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { EkStatusChip } from '@entegrasyonik/ui/components'
import { formatDuration, formatNumber } from '@entegrasyonik/ui/format'
import { SETTING_DANGER_TONE } from '@/design/status-map'
import type { SettingMeta } from './settingsCatalogMirror'

const props = defineProps<{
  meta: SettingMeta
  /** Taslakta bu anahtar için düzenlenen değer YOKSA `effectiveValue` gösterilir (kontrollü alan). */
  modelValue: unknown
  /** `platform.integrationConfig.get` → `values[]`'ten bu anahtarın çözümlenmiş değeri. */
  effectiveValue: unknown
  effectiveSource: 'default' | 'platform' | 'env' | 'tenant' | 'legacy'
  effectiveRevision?: number
  /** Bu hedef/entegrasyon bağlamında geçerli varsayılan (entegrasyon bazlı olabilir, çağıran çözer). */
  defaultValue: unknown
  /** Taslakta bu anahtar için bir geçersiz kılma VAR MI (varsa "Varsayılana dön" görünür). */
  isOverridden: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: unknown]; reset: [] }>()

const showImpact = ref(false)
const showAdvanced = ref(false)

const dangerEntry = computed(() => SETTING_DANGER_TONE[props.meta.danger])
const dangerLabel = computed(() => (props.meta.danger === 'dangerous' ? 'Tehlikeli' : 'Dikkat'))

const envLocked = computed(() => !!props.meta.envLock && props.effectiveSource === 'env')
const readonly = computed(() => !props.meta.overridable || envLocked.value)

const UNIT_SUFFIX: Record<string, string> = { ms: 'ms', s: 'sn', min: 'dk', h: 'sa', day: 'gün', count: '', perMin: '/dk', percent: '%' }
const unitSuffix = computed(() => (props.meta.unit ? UNIT_SUFFIX[props.meta.unit] ?? '' : ''))

function displayValue(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'boolean') return value ? 'Açık' : 'Kapalı'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(boş liste)'
  if (typeof value === 'number') {
    if (props.meta.type === 'duration') return formatDuration(value, props.meta.unit)
    return formatNumber(value)
  }
  return String(value)
}

const defaultDisplay = computed(() => displayValue(props.defaultValue))
const effectiveDisplay = computed(() => displayValue(props.effectiveValue))
const stringListDisplay = computed(() => (Array.isArray(props.modelValue) ? props.modelValue.join('\n') : ''))

const SOURCE_LABELS: Record<string, string> = {
  default: 'Varsayılan', platform: 'Platform', env: 'Ortam değişkeni', tenant: 'Kiracı', legacy: 'Eski DB',
}
const sourceLabel = computed(() => {
  const base = SOURCE_LABELS[props.effectiveSource] ?? props.effectiveSource
  return props.effectiveSource === 'platform' && props.effectiveRevision ? `${base} v${props.effectiveRevision}` : base
})

const APPLIES_LABELS: Record<string, string> = { immediate: 'Hemen', next_cycle: 'Sonraki turda', restart: 'Yeniden başlatma gerekir' }
const appliesLabel = computed(() => APPLIES_LABELS[props.meta.applies] ?? props.meta.applies)

const outOfSafeRange = computed(() => {
  const range = props.meta.safeRange
  if (!range || typeof props.modelValue !== 'number') return false
  return props.modelValue < range.min || props.modelValue > range.max
})

function onNumberInput(raw: string | number) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  emit('update:modelValue', Number.isFinite(n) ? n : raw)
}
</script>

<style scoped>
.setting-field {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.setting-field--readonly {
  /* NOT (araştırma bulgusu): `--ek-color-surface-muted` zemini + Vuetify'ın kendi varsayılan
   * `v-label` metin rengi kombinasyonu axe `color-contrast` (4.23, gerekli 4.5) ihlali üretiyordu —
   * salt-okunur ayrımı zemin yerine yalnızca kilit notu METNİYLE (yukarıda) yapılır. */
  border-color: var(--ek-color-border-default);
}

.setting-field__label-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.setting-field__label {
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.setting-field__impact-toggle {
  width: 18px;
  height: 18px;
  border-radius: var(--ek-radius-full);
  border: 1px solid var(--ek-color-border-strong);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-xs);
  line-height: 1;
  cursor: pointer;
}

.setting-field__help,
.setting-field__impact {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
  margin: 0;
}

.setting-field__impact {
  color: var(--ek-color-content-default);
}

.setting-field__control {
  max-width: 320px;
}

.setting-field__meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.setting-field__reset {
  background: none;
  border: none;
  color: var(--ek-color-primary);
  font-size: var(--ek-font-size-xs);
  cursor: pointer;
  padding: 0;
}

.setting-field__lock-note,
.setting-field__range-warning {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-size: var(--ek-font-size-xs);
  margin: 0;
}

.setting-field__lock-note {
  color: var(--ek-color-content-muted);
}

.setting-field__range-warning {
  color: var(--ek-color-warning);
}

.setting-field__advanced-toggle {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-xs);
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.setting-field__advanced {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}
</style>
