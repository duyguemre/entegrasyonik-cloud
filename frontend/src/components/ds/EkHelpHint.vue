<!--
  frontend/src/components/ds/EkHelpHint.vue

  Bağlamsal yardım — kritik alanların yanında küçük (?) ipucu (toggletip). Metin `help/hints.ts` kaydından gelir
  (`hint` kimliği) ya da doğrudan `title`/`text` ile verilir. Tıklama / Enter / Boşluk açar; Esc ve dışarı tıklama
  kapatır, odak düğmeye döner. İçerik DÜZ metindir; isteğe bağlı "Yardım merkezinde oku" ilgili makaleyi açar.

    <EkHelpHint hint="stock.safetyStock" />
    <EkHelpHint title="Güvenlik stoğu" text="…" article="stock-channel-policy" />

  Erişilebilirlik: düğmenin erişilebilir adı "Yardım: <başlık>"; `aria-expanded` + `aria-controls`; açılan kutu
  `role="dialog"` + başlıkla adlandırılır. Tuş hedefi 24px (görsel 18px ikon), odak halkası token'la.
-->
<template>
  <v-menu
    v-model="open"
    :location="location"
    :offset="6"
    :close-on-content-click="false"
    :eager="false"
    transition="fade-transition"
    max-width="320"
  >
    <template #activator="{ props: activatorProps }">
      <button
        type="button"
        class="ek-help-hint"
        :class="{ 'is-open': open }"
        v-bind="activatorProps"
        :aria-label="`Yardım: ${resolved.title}`"
        :aria-expanded="open"
        :aria-controls="open ? panelId : undefined"
        aria-haspopup="dialog"
        data-help-hint
        :data-hint-id="hint"
        @click.stop
      >
        <v-icon icon="mdi-help-circle-outline" aria-hidden="true" />
      </button>
    </template>
    <div :id="panelId" class="ek-help-hint__panel" role="dialog" :aria-labelledby="`${panelId}-title`">
      <p :id="`${panelId}-title`" class="ek-help-hint__title">{{ resolved.title }}</p>
      <p class="ek-help-hint__text">{{ resolved.text }}</p>
      <button v-if="resolved.article" type="button" class="ek-help-hint__more" @click="readMore">
        Yardım merkezinde oku
        <v-icon icon="mdi-arrow-right" aria-hidden="true" />
      </button>
    </div>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { HELP_HINTS, type HelpHintId } from '@/help/hints'
import { useHelpNavigation } from '@/help/useHelpNavigation'

const props = withDefaults(
  defineProps<{
    /** `help/hints.ts` kimliği. */
    hint?: HelpHintId
    /** Kayıt dışı kullanım (kimlik verilmezse zorunlu). */
    title?: string
    text?: string
    /** İlgili yardım makalesi kimliği (kayıttakini ezer). */
    article?: string
    location?: 'top' | 'bottom' | 'start' | 'end'
  }>(),
  { location: 'bottom' },
)

const open = ref(false)
const panelId = `ek-help-hint-${useId()}`
const nav = useHelpNavigation()

const resolved = computed(() => {
  const fromRegistry = props.hint ? (HELP_HINTS as Record<string, { title: string; text: string; article?: string }>)[props.hint] : undefined
  return {
    title: props.title ?? fromRegistry?.title ?? 'Yardım',
    text: props.text ?? fromRegistry?.text ?? '',
    article: props.article ?? fromRegistry?.article,
  }
})

function readMore() {
  open.value = false
  nav.openHelp(resolved.value.article)
}
</script>

<style scoped>
.ek-help-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  margin: -3px 0;
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-chip);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: 18px;
  vertical-align: middle;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-help-hint :deep(.v-icon) {
  font-size: 18px;
}

.ek-help-hint:hover,
.ek-help-hint.is-open {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-help-hint:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-help-hint__panel {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface-raised);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-popover);
  box-shadow: var(--ek-shadow-popover);
}

.ek-help-hint__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-hint__text {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: 1.5;
  white-space: pre-line;
}

.ek-help-hint__more {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  align-self: flex-start;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ek-color-action);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
}

.ek-help-hint__more:hover {
  text-decoration: underline;
}

.ek-help-hint__more:focus-visible {
  outline: none;
  border-radius: var(--ek-radius-chip);
  box-shadow: var(--ek-focus-ring);
}

.ek-help-hint__more :deep(.v-icon) {
  font-size: var(--ek-icon-sm);
}
</style>
