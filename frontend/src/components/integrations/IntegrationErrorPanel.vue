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
  <!-- Aşama 6b (Standart 1): görünüm ds `EkProblemState`'ten gelir; bu bileşen yalnız sınıflandırılmış bilgiyi bağlar. -->
  <EkProblemState
    ref="problemRef"
    class="ek-int-err"
    :class="[`ek-int-err--${info.kind}`]"
    data-testid="integration-error-panel"
    :data-kind="info.kind"
    :title="info.title"
    :cause="info.cause"
    :action="info.action"
    :tone="toneFor"
    :icon="iconFor"
    :details="rows"
    :retryable="info.retryable"
    :retry-label="info.empty ? 'Yeniden kontrol et' : 'Tekrar dene'"
    :retrying="retrying"
    :size="compact ? 'compact' : 'inline'"
    :autofocus="autofocus"
    @retry="emit('retry')"
  >
    <template v-if="showSettings" #actions>
      <EkButton tone="secondary" size="sm" :icon="icons.settings" trailing-icon="mdi-arrow-right" @click="openSettings.open(info.integrationCode)">
        Entegrasyon ayarına git
      </EkButton>
    </template>
  </EkProblemState>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkProblemState from '@/components/ds/EkProblemState.vue'
import { icons } from '@/design/icons'
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

const TONE = { timeout: 'warning', network: 'warning', server: 'error', auth: 'error', unknown: 'error', notFound: 'neutral', empty: 'neutral' } as const
const ICON = {
  timeout: 'mdi-timer-sand',
  network: 'mdi-lan-disconnect',
  server: 'mdi-alert-circle-outline',
  auth: 'mdi-lock-outline',
  unknown: icons.help,
  notFound: 'mdi-file-search-outline',
  empty: 'mdi-tray-arrow-down',
} as const
const toneFor = computed(() => TONE[props.info.kind])
const iconFor = computed(() => ICON[props.info.kind])
</script>
