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

  Kullanım:
    <IntegrationFormFrame v-model="activeTab" :tabs="[{value:1,label:'Api Bilgileri'},{value:2,label:'Varsayılan Bilgiler'}]"
      @save="emits('update', editingClientIntegration)" @clear="emits('refresh', editingClientIntegration.code)">
      <v-window-item :value="1">…</v-window-item>
      <v-window-item :value="2">…</v-window-item>
    </IntegrationFormFrame>
-->
<template>
  <div class="ek-integration-frame">
    <EkPageTabs
      :model-value="String(modelValue)"
      :tabs="tabs.map(tab => ({ value: String(tab.value), label: tab.label }))"
      class="ek-integration-frame__tabs"
      @update:model-value="(v) => emit('update:modelValue', castBack(v))"
    />

    <v-card variant="flat" class="ek-integration-frame__card">
      <v-card-text class="pa-6">
        <v-window :model-value="modelValue">
          <slot />
        </v-window>
      </v-card-text>
    </v-card>

    <div class="ek-integration-frame__actions">
      <v-btn variant="outlined" class="ek-integration-frame__btn-clear" @click="emit('clear')">
        <v-icon start size="18">mdi-undo-variant</v-icon>
        {{ clearLabel }}
      </v-btn>

      <v-spacer class="d-none d-sm-block" />

      <v-btn color="primary" class="ek-integration-frame__btn-save" @click.stop="emit('save')">
        <v-icon start size="18">mdi-check-circle-outline</v-icon>
        {{ saveLabel }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import EkPageTabs from '@/components/ds/EkPageTabs.vue'

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
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.ek-integration-frame__actions {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  flex-wrap: wrap;
}

.ek-integration-frame__btn-clear,
.ek-integration-frame__btn-save {
  flex: 1 1 auto;
}

@media (min-width: 600px) {
  .ek-integration-frame__btn-clear,
  .ek-integration-frame__btn-save {
    flex: none;
  }
}
</style>
