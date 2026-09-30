<!--
  frontend/src/components/integrations/IntegrationErrorPanel.vue

  Pazaryeri verisi (kategori ağacı, kategori özellikleri, özellik değerleri) alınamadığında ya da boş
  geldiğinde TEK gösterim: NE OLDU (başlık) · OLASI NEDEN · NE YAPMALI · [Tekrar dene] [Entegrasyon ayarına git]
  · katlanır TEKNİK AYRINTI. Metinler ve sınıflandırma `composables/useIntegrationError.ts`'ten gelir
  (bu bileşen metin UYDURMAZ). Boş liste (`info.empty`) hata değildir: nötr ton, `role="status"`.

  Erişilebilirlik: hata → `role="alert"` YOK (odak başlığa taşınır, çift anons olmaz); başlık `tabindex="-1"` ve
  görününce / yeniden başarısız olunca odak alır (`autofocus`); "Tekrar dene" sırasında düğme yükleniyor
  (`EkButton loading`, `aria-busy`) ve gizli `aria-live="polite"` bölgesi durumu duyurur. Teknik ayrıntı yerel
  `<details>` (klavye + ekran okuyucu yerleşik; hareket yok).

  Kullanım:
    <IntegrationErrorPanel :info="error" :retrying="loading" @retry="load" />
-->
<template>
  <section class="ek-int-err" :class="[`ek-int-err--${info.kind}`, { 'ek-int-err--compact': compact }]"
    :aria-labelledby="titleId" :role="info.empty ? 'status' : 'group'" data-testid="integration-error-panel"
    :data-kind="info.kind">
    <EkIconTile :icon="iconFor" :tone="toneFor" size="md" />
    <div class="ek-int-err__body">
      <h3 :id="titleId" ref="titleRef" class="ek-int-err__title" tabindex="-1">{{ info.title }}</h3>
      <p class="ek-int-err__line"><span class="ek-int-err__label">Olası neden</span>{{ info.cause }}</p>
      <p class="ek-int-err__line"><span class="ek-int-err__label">Ne yapmalı</span>{{ info.action }}</p>

      <div v-if="info.retryable || showSettings" class="ek-int-err__actions">
        <EkButton v-if="info.retryable" tone="secondary" size="sm" icon="mdi-refresh" :loading="retrying"
          @click="emit('retry')">
          {{ info.empty ? 'Yeniden kontrol et' : 'Tekrar dene' }}
        </EkButton>
        <EkButton v-if="showSettings" tone="ghost" size="sm" icon="mdi-cog-outline" trailing-icon="mdi-arrow-right"
          @click="openSettings.open(info.integrationCode)">
          Entegrasyon ayarına git
        </EkButton>
      </div>

      <details class="ek-int-err__tech">
        <summary>Teknik ayrıntı</summary>
        <dl class="ek-int-err__dl">
          <template v-for="row in rows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </template>
        </dl>
      </details>
    </div>
    <span class="ek-int-err__live" role="status" aria-live="polite">{{ liveText }}</span>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import { technicalDetails, type IntegrationErrorInfo } from '@/composables/useIntegrationError'
import { useOpenIntegrationSettings } from '@/composables/useOpenIntegrationSettings'

const props = withDefaults(
  defineProps<{
    info: IntegrationErrorInfo
    /** "Tekrar dene" isteği sürüyor (düğme yükleniyor, ekran okuyucuya duyurulur). */
    retrying?: boolean
    /** Görününce / yeniden başarısız olunca odağı başlığa taşır. */
    autofocus?: boolean
    compact?: boolean
  }>(),
  { retrying: false, autofocus: true, compact: false },
)

const emit = defineEmits<{ retry: [] }>()

const openSettings = useOpenIntegrationSettings()
const showSettings = computed(() => props.info.canOpenSettings && openSettings.canOpen(props.info.integrationCode))
const rows = computed(() => technicalDetails(props.info))

const titleId = `ek-int-err-${Math.random().toString(36).slice(2, 9)}`
const titleRef = ref<HTMLElement | null>(null)
const liveText = ref('')

const TONE = { timeout: 'warning', network: 'warning', server: 'error', auth: 'error', unknown: 'error', notFound: 'neutral', empty: 'neutral' } as const
const ICON = {
  timeout: 'mdi-timer-sand',
  network: 'mdi-lan-disconnect',
  server: 'mdi-alert-circle-outline',
  auth: 'mdi-lock-outline',
  unknown: 'mdi-help-circle-outline',
  notFound: 'mdi-file-search-outline',
  empty: 'mdi-tray-arrow-down',
} as const
const toneFor = computed(() => TONE[props.info.kind])
const iconFor = computed(() => ICON[props.info.kind])

function focusTitle() {
  nextTick(() => titleRef.value?.focus({ preventScroll: false }))
}

onMounted(() => {
  if (props.autofocus) focusTitle()
})

// Yeniden deneme: sürerken duyur; aynı panel hâlâ görünüyorsa (yine başarısız) odak başlığa döner.
watch(
  () => props.retrying,
  (now, before) => {
    if (now) liveText.value = 'Tekrar deneniyor.'
    else if (before) {
      liveText.value = props.info.empty ? 'Yeniden kontrol edildi; liste yine boş.' : 'Yeniden denendi; yanıt yine alınamadı.'
      if (props.autofocus) focusTitle()
    }
  },
)
</script>

<style scoped>
.ek-int-err {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-default);
  position: relative;
}

.ek-int-err--compact {
  padding: var(--ek-space-3);
}

.ek-int-err__body {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.ek-int-err__title {
  margin: 0;
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  line-height: var(--ek-line-height-normal);
}

.ek-int-err__title:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
  border-radius: var(--ek-radius-sm);
}

.ek-int-err__line {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
  line-height: var(--ek-line-height-normal);
  overflow-wrap: anywhere;
}

.ek-int-err__label {
  display: block;
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ek-color-content-default);
}

.ek-int-err__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-1);
}

.ek-int-err__tech {
  margin-top: var(--ek-space-1);
  font-size: var(--ek-font-size-sm);
}

.ek-int-err__tech summary {
  cursor: pointer;
  width: fit-content;
  padding: var(--ek-space-1) 0;
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-medium);
  border-radius: var(--ek-radius-sm);
}

.ek-int-err__tech summary:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-int-err__dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--ek-space-1) var(--ek-space-4);
  margin: var(--ek-space-2) 0 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}

.ek-int-err__dl dt {
  color: var(--ek-color-content-muted);
}

.ek-int-err__dl dd {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-font-size-xs);
  overflow-wrap: anywhere;
}

/* 390px: etiket üstte, değer altta (üst üste binme yok). */
@media (max-width: 599px) {
  .ek-int-err {
    flex-direction: column;
  }

  .ek-int-err__dl {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .ek-int-err__dl dd {
    margin-bottom: var(--ek-space-2);
  }
}

.ek-int-err__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
