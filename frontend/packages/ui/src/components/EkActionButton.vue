<!--
  frontend/src/components/ds/EkActionButton.vue

  DS-v2 Aşama 6b — Standart 10: EYLEM İKON DÜĞMESİ. Glif, varsayılan ipucu ve ton `design/icons.ts` kayıt defterinden
  gelir; ekran ikon seçmez. Aynı iş = aynı ikon · aynı boyut (sm: 32px kutu / 16px glif) · aynı ton · aynı ipucu dili.
  Tehlikeli eylemler (`delete`, `cancel`) hata tonunda çizilir ve çağıran ONAY diyaloğu açmakla yükümlüdür.
  Yalnız-ikon düğmede ipucu = aria-label (tek metin kaynağı). `object` verilirse ipucu "<nesne> <fiil>" olur.

    <EkActionButton action="view" object="Siparişi" @click="open(row)" />       → "Siparişi görüntüle"
    <EkActionButton action="delete" :label="`${row.name} ürününü sil`" @click="confirmDelete(row)" />
-->
<template>
  <EkTooltip :text="text" :shortcut="shortcut ?? def.shortcut" :open-delay="500">
    <EkButton
      class="ek-action-btn"
      :class="{ 'ek-action-btn--danger': isDanger }"
      tone="ghost"
      :size="size"
      :icon="icon ?? def.icon"
      :icon-only="!showLabel"
      :aria-label="text"
      :disabled="disabled"
      :loading="loading"
      :data-action="action"
      v-bind="$attrs"
      @click="(e: MouseEvent) => emit('click', e)"
    >
      <template v-if="showLabel">{{ text }}</template>
    </EkButton>
  </EkTooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkButton from './EkButton.vue'
import EkTooltip from './EkTooltip.vue'
import { ACTION_ICONS, actionLabel, type ActionIconDef, type ActionKey } from '../icons'

// Kök bir ipucu parçası (fragment) — öznitelik ve tıklama doğrudan düğmeye bağlanır.
defineOptions({ inheritAttrs: false })
const emit = defineEmits<{ click: [event: MouseEvent] }>()

const props = withDefaults(
  defineProps<{
    action: ActionKey
    /** Tam ipucu/aria-label (verilmezse kayıt defteri fiili; `object` ile "<nesne> <fiil>"). */
    label?: string
    object?: string
    size?: 'sm' | 'md'
    /** Metinli gösterim (araç çubuğu); varsayılan yalnız ikon. */
    showLabel?: boolean
    disabled?: boolean
    loading?: boolean
    shortcut?: string | string[]
    /** Alan-özel eylem ikonu (ör. Yanıtla, Okundu işaretle). Genel fiiller (sil, düzenle, görüntüle …) kayıt defterinden gelir. */
    icon?: string
  }>(),
  { size: 'sm', showLabel: false, disabled: false, loading: false },
)

const def = computed<ActionIconDef>(() => ACTION_ICONS[props.action])
const text = computed(() => props.label ?? actionLabel(props.action, props.object))
const isDanger = computed(() => !!def.value.danger)
</script>

<style scoped>
/* Satır/kart eylem düğmesi — TEK görünüm, iki ton:
   durağan: tüm eylemler aynı sakin nötr ikon (satır kalabalık görünmez; tehlikeli olan da sakin);
   hover/odak: nötr eylem → site mavisinin açık tonunda yuvarlatılmış zemin + mavi ikon; tehlikeli → açık kırmızı zemin
   + kırmızı ikon; basılıyken bir kademe koyu. Gölge/kenarlık yok, yalnız renk; ikon hafifçe büyür (geometri sabit). */
.ek-action-btn {
  --ek-act-tint: var(--ek-color-action);
  --ek-btn-fg: var(--ek-color-content-muted);
  --ek-btn-bg-hover: color-mix(in srgb, var(--ek-act-tint) 10%, transparent);
  --ek-btn-bg-active: color-mix(in srgb, var(--ek-act-tint) 18%, transparent);
  --ek-btn-border-hover: transparent;
  border-radius: 8px;
  transition:
    background-color var(--ek-motion-feedback),
    color var(--ek-motion-feedback);
}

.ek-action-btn--danger {
  --ek-act-tint: var(--ek-color-error);
}

.ek-action-btn:hover:not(:disabled),
.ek-action-btn:focus-visible,
.ek-action-btn:active:not(:disabled) {
  color: var(--ek-act-tint);
}

.ek-action-btn :deep(.v-icon) {
  transition: transform var(--ek-motion-feedback);
}

.ek-action-btn:hover:not(:disabled) :deep(.v-icon) {
  transform: scale(1.08);
}

@media (prefers-reduced-motion: reduce) {
  .ek-action-btn:hover:not(:disabled) :deep(.v-icon) {
    transform: none;
  }
}
</style>
