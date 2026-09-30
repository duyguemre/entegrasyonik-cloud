<!--
  frontend/src/components/ds/EkProblemState.vue

  DS-v2 Aşama 6b — Standart 1: TEK HATA DURUMU DESENİ. Sayfa, liste gövdesi, panel ve entegrasyon yanıtı alınamama
  (kategori/özellik/değer eşleme dahil) hep bu bileşenle çizilir:
      [ikon kapsülü]  NE OLDU (başlık)
                      NEDEN          → olası neden (varsa)
                      NE YAPMALI     → kullanıcının yapabileceği
                      [Tekrar dene] [#actions — ör. "Entegrasyon ayarına git"]
                      ▸ Teknik ayrıntı (katlanır; HTTP durumu, servis, istek kimliği … — gövdede ham hata YOK)
  Ton: error (varsayılan) · warning (zaman aşımı/ağ) · info · neutral (boş liste — hata değil, `role=status`).
  Boyut: `page` (ortalanmış blok, sayfa/ızgara gövdesi) · `inline` (tam genişlik panel) · `compact` (dar alan).
  Erişilebilirlik: başlık `tabindex=-1` ve `autofocus` ile görününce odak alır (çift anons yerine); "Tekrar dene"
  sürerken düğme yükleniyor (`aria-busy`) ve gizli canlı bölge durumu duyurur. Teknik ayrıntı yerel `<details>`.

    <EkProblemState title="Siparişler yüklenemedi" action="Bağlantınızı kontrol edip tekrar deneyin." @retry="load" />
    <EkProblemState v-bind="problemFromError(err)" :retrying="loading" @retry="load" />
-->
<template>
  <section
    class="ek-problem"
    :class="[`ek-problem--${tone}`, `ek-problem--${size}`]"
    :role="tone === 'neutral' || tone === 'info' ? 'status' : 'group'"
    :aria-labelledby="titleId"
  >
    <EkIconTile :icon="resolvedIcon" :tone="tone" :size="size === 'compact' ? 'sm' : size === 'page' ? 'lg' : 'md'" />
    <div class="ek-problem__body">
      <h3 :id="titleId" ref="titleRef" class="ek-problem__title" tabindex="-1">{{ title }}</h3>
      <p v-if="cause" class="ek-problem__line"><span class="ek-problem__label">Olası neden</span>{{ cause }}</p>
      <p v-if="action" class="ek-problem__line"><span v-if="cause" class="ek-problem__label">Ne yapmalı</span>{{ action }}</p>
      <div v-if="retryable || $slots.actions" class="ek-problem__actions">
        <EkButton v-if="retryable" tone="secondary" size="sm" :icon="icons.refresh" :loading="retrying" @click="emit('retry')">
          {{ retryLabel }}
        </EkButton>
        <slot name="actions" />
      </div>
      <details v-if="details && details.length" class="ek-problem__tech" @toggle="techOpen = ($event.target as HTMLDetailsElement).open">
        <summary>Teknik ayrıntı</summary>
        <!-- Kapalıyken içerik DOM'da yok: ham kod/ileti sayfa metnine sızmaz (yalnız istenince). -->
        <dl v-if="techOpen" class="ek-problem__dl">
          <template v-for="row in details" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </template>
        </dl>
      </details>
    </div>
    <span class="ek-sr-only" role="status" aria-live="polite">{{ liveText }}</span>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import EkButton from './EkButton.vue'
import EkIconTile from './EkIconTile.vue'
import { icons } from '../icons'

export type EkProblemTone = 'error' | 'warning' | 'info' | 'neutral'

const props = withDefaults(
  defineProps<{
    /** NE OLDU — sade dil; ham hata/HTTP kodu YOK. */
    title: string
    /** OLASI NEDEN (bilinmiyorsa verilmez — uydurulmaz). */
    cause?: string
    /** NE YAPMALI. */
    action?: string
    tone?: EkProblemTone
    icon?: string
    /** Katlanır teknik ayrıntı satırları (sır/PII içermez). */
    details?: Array<{ label: string; value: string }>
    retryable?: boolean
    retryLabel?: string
    retrying?: boolean
    size?: 'page' | 'inline' | 'compact'
    autofocus?: boolean
  }>(),
  { tone: 'error', retryable: true, retryLabel: 'Tekrar dene', retrying: false, size: 'inline', autofocus: false },
)

const emit = defineEmits<{ retry: [] }>()

const DEFAULT_ICON: Record<EkProblemTone, string> = {
  error: 'mdi-alert-circle-outline',
  warning: 'mdi-alert-outline',
  info: icons.info,
  neutral: 'mdi-tray-arrow-down',
}
const resolvedIcon = computed(() => props.icon ?? DEFAULT_ICON[props.tone])
const titleId = `ek-problem-${useId()}`
const titleRef = ref<HTMLElement | null>(null)
const liveText = ref('')
const techOpen = ref(false)

function focusTitle() {
  nextTick(() => titleRef.value?.focus({ preventScroll: true }))
}

onMounted(() => {
  if (props.autofocus) focusTitle()
})

watch(
  () => props.retrying,
  (now, before) => {
    if (now) liveText.value = 'Tekrar deneniyor.'
    else if (before) {
      liveText.value = props.tone === 'neutral' ? 'Yeniden kontrol edildi; sonuç değişmedi.' : 'Yeniden denendi; sorun sürüyor.'
      if (props.autofocus) focusTitle()
    }
  },
)

defineExpose({ focusTitle })
</script>

<style scoped>
.ek-problem {
  --ek-problem-accent: var(--ek-color-error);
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-left: 3px solid var(--ek-problem-accent);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-default);
  text-align: left;
}

.ek-problem--warning { --ek-problem-accent: var(--ek-color-warning); }
.ek-problem--info { --ek-problem-accent: var(--ek-color-info); }
.ek-problem--neutral { --ek-problem-accent: var(--ek-color-border-strong); }

.ek-problem--page {
  max-width: 560px;
  margin: var(--ek-space-8) auto;
  padding: var(--ek-space-5);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.ek-problem--compact {
  padding: var(--ek-space-3);
  gap: var(--ek-space-2);
}

.ek-problem__body {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.ek-problem__title {
  margin: 0;
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-problem--page .ek-problem__title {
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
}

.ek-problem__title:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
  border-radius: var(--ek-radius-sm);
}

.ek-problem__line {
  margin: 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-muted);
  overflow-wrap: anywhere;
}

.ek-problem__label {
  display: block;
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ek-color-content-default);
}

.ek-problem__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-1);
}

.ek-problem__tech {
  margin-top: var(--ek-space-1);
  font-size: var(--ek-type-caption-size);
}

.ek-problem__tech summary {
  cursor: pointer;
  width: fit-content;
  padding: var(--ek-space-1) 0;
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-medium);
  border-radius: var(--ek-radius-sm);
}

.ek-problem__tech summary:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-problem__dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--ek-space-1) var(--ek-space-4);
  margin: var(--ek-space-2) 0 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}

.ek-problem__dl dt {
  color: var(--ek-color-content-muted);
}

.ek-problem__dl dd {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
  overflow-wrap: anywhere;
}

@media (max-width: 599px) {
  .ek-problem {
    flex-direction: column;
  }

  .ek-problem__dl {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .ek-problem__dl dd {
    margin-bottom: var(--ek-space-2);
  }
}
</style>
