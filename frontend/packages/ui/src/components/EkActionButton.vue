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
.ek-action-btn--danger {
  --ek-btn-fg: var(--ek-color-error);
  --ek-btn-bg-hover: var(--ek-color-error-subtle);
  --ek-btn-bg-active: var(--ek-color-error-subtle);
}
</style>
