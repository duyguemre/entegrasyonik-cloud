<!--
  frontend/src/components/integrations/IntegrationFormFrame.vue

  ADR-0015 Aşama B2 — canlı (backend'i gerçekten olan) entegrasyon ayar
  formlarının (Trendyol/Hepsiburada/N11/Pazarama/Ideasoft/Bizimhesap) ORTAK
  çerçevesi: sekme şeridi (`EkPageTabs`, Karar 6.1) + kart gövdesi (token
  kenarlık, gölge yok, Karar 1.1) + alt eylem çubuğu (Vazgeç ikincil ·
  Kaydet birincil, Karar 6.2). Önceden her platform bileşeni (Trendyol,
  Hepsiburada, N11, Pazarama, Ideasoft, Bizimhesap) bu çerçeveyi ~70 satır
  literal "rgb, değişken(--v-theme-*)" ve "!important" CSS'iyle KENDİ İÇİNDE
  tekrar tanımlıyordu (6 kopya, "tek iş = tek desen" ihlali). Bu bileşen
  TEK kaynaktır; platform bileşenleri yalnızca sekme İÇERİĞİNİ (`v-window-item`)
  slot olarak verir.

  DS-v2 Aşama 2: sekmeler kartın başlık bandında; kart gövdesi = `surface` + `border-default` + `shadow-card`,
  eylem çubuğu kartın ALTINDA bant (diyalog eylem çubuğuyla aynı dil):
  [#actions-start] ........ Vazgeç (ikincil) · Kaydet (birincil). Sekme
  içerikleri `EkFormSection` + `EkFormGrid` ile dizilir (alanlar üst üste
  binmez). Dış API (props/olaylar/slot) DEĞİŞMEDİ.

  Kullanım:
    <IntegrationFormFrame v-model="activeTab" :tabs="[{value:1,label:'API Bilgileri'},{value:2,label:'Varsayılan Bilgiler'}]"
      @save="emits('update', editingClientIntegration)" @clear="emits('refresh', editingClientIntegration.code)">
      <v-window-item :value="1">…</v-window-item>
      <v-window-item :value="2">…</v-window-item>
    </IntegrationFormFrame>
-->
<template>
  <div class="ek-integration-frame">
    <section class="ek-integration-frame__card">
      <EkPageTabs
        :model-value="String(modelValue)"
        :tabs="tabs.map(tab => ({ value: String(tab.value), label: tab.label }))"
        class="ek-integration-frame__tabs"
        @update:model-value="(v) => emit('update:modelValue', castBack(String(v)))"
      />
      <div class="ek-integration-frame__body">
        <v-window :model-value="modelValue">
          <slot />
        </v-window>
      </div>

      <footer class="ek-integration-frame__actions">
        <div class="ek-integration-frame__actions-start"><slot name="actions-start" /></div>
        <EkButton tone="secondary" icon="mdi-undo-variant" class="ek-integration-frame__btn-clear" @click="emit('clear')">
          {{ clearLabel }}
        </EkButton>
        <EkButton tone="primary" icon="mdi-content-save-outline" class="ek-integration-frame__btn-save" @click.stop="emit('save')">
          {{ saveLabel }}
        </EkButton>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { EkPageTabs, EkButton } from '@entegrasyonik/ui/components'

export interface IntegrationFormTab {
  value: number | string
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: number | string
    tabs: IntegrationFormTab[]
    saveLabel?: string
    clearLabel?: string
  }>(),
  {
    saveLabel: 'Kaydet',
    clearLabel: 'Vazgeç',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: number | string]
  save: []
  clear: []
}>()

// `EkPageTabs` string `value` sözleşmesiyle çalışır (Karar 6.1); çağıranların
// çoğu `v-window-item :value="1"` (sayısal) kullandığı için burada geri
// çevrilir — dış API (activeTab) sayısal KALIR, yalnızca bu bileşenin içinde
// string'e dönüştürülür.
function castBack(value: string) {
  const original = props.tabs.find((tab) => String(tab.value) === value)
  return original ? original.value : value
}
</script>

<style scoped>
.ek-integration-frame {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-integration-frame__card {
  overflow: hidden;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
}

/* FE-LOCAL-1048: sekme bandı kartın başlığı — sakin zemin + ince alt çizgi (liste başlık/alt bantlarıyla aynı). */
.ek-integration-frame__tabs {
  padding: var(--ek-space-2) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.ek-integration-frame__body {
  padding: var(--ek-space-6);
}

.ek-integration-frame__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-6);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.ek-integration-frame__actions-start {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-integration-frame__actions-start:empty {
  display: none;
}

@media (max-width: 599px) {
  .ek-integration-frame__body {
    padding: var(--ek-space-4);
  }

  .ek-integration-frame__tabs {
    padding: 0;
  }

  .ek-integration-frame__actions {
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .ek-integration-frame__actions-start {
    flex-basis: 100%;
  }
  .ek-integration-frame__btn-clear,
  .ek-integration-frame__btn-save {
    flex: 1 1 0;
  }
}
</style>
