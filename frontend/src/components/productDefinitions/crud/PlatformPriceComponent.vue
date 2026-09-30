<!--
  frontend/src/components/productDefinitions/crud/PlatformPriceComponent.vue

  Platform (kanal) bazında varyant fiyatları. DS-v2 A6a: her kanal katlanabilir bir bölümdür —
  başlıkta kanal işareti (EkPlatformMark, kanal rengi) + özet fiyat; gövdede satış/piyasa fiyatı.
  Fiyat kaydı olmayan kanalda (eski ürünler) satır sessizce kaybolmaz: "Fiyat gir" ile açılır.
  Model ve toplu atama mantığı DEĞİŞMEDİ (`platformPriceForm.platforms[kod].prices`).
-->
<template>
  <div class="ppc-root">
    <section class="ppc-batch" aria-label="Toplu fiyat atama">
      <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop v-model="batch.price"
        :compact="false" label="Toplu Fiyat Atama" clearable :required="false"
        hint="Fiyatları toplu olarak değiştirmek için miktar ya da yüzdelik oran giriniz"
        :hide-details="false" counter>
        <template #append-inner>
          <v-tooltip open-delay="1000" :text="$t('productDefinitions.product.define.applyPricesDesc')">
            <template v-slot:activator="{ props: tooltipProps }">
              <v-menu>
                <template v-slot:activator="{ props: menuProps }">
                  <v-btn v-bind="{ ...tooltipProps, ...menuProps }" elevation=0 color="neutral">
                    Uygula <v-icon size="large">mdi-menu-down</v-icon>
                  </v-btn>
                </template>
                <v-card width="350" class="pb-0 pt-0">
                  <v-list density="compact" class="pa-0">

                    <v-list-item>
                      <v-radio-group inline hide-details v-model="batch.isSalePrice" density="compact" @click.stop>
                        <v-radio :value="true" density="compact"
                          :label="$t('productDefinitions.product.define.salePrice')">
                        </v-radio>
                        <v-radio :value="false" density="compact"
                          :label="$t('productDefinitions.product.define.marketPrice')">
                        </v-radio>
                      </v-radio-group>
                    </v-list-item>

                    <v-list-item>
                      <v-checkbox label="Çıkar" density="compact" @click.stop hide-details
                        v-model="batch.isDecrease" class="text-right justify-start d-flex" />
                    </v-list-item>
                    <v-divider thickness="2" />
                    <v-list-item @click="applyPrices('CONSTANT')">
                      <template #prepend>
                        <v-icon color="primary" class="ppc-menu-icon">mdi-currency-try</v-icon>
                      </template>
                      {{ batch.isSalePrice ? 'Satış' : 'Piyasa' }} Fiyatlarına Ata
                    </v-list-item>
                    <v-divider />
                    <v-list-item @click="applyPrices('PERCENTAGE')">
                      <template #prepend>
                        <v-icon color="content-muted" class="ppc-menu-icon">mdi-percent</v-icon>
                      </template>
                      Yüzdelik Olarak {{ batch.isSalePrice ? 'Satış' : 'Piyasa' }} {{ !batch.isDecrease ? 'Fiyatlarına Ekle':'Fiyatlarından Çıkar'}}
                    </v-list-item>
                    <v-divider />
                    <v-list-item @click="applyPrices('VALUE')">
                      <template #prepend>
                        <v-icon color="primary" class="ppc-menu-icon">{{ !batch.isDecrease ? 'mdi-plus' : 'mdi-minus' }}</v-icon>
                      </template>
                      {{ batch.isSalePrice ? 'Satış' : 'Piyasa' }} {{ !batch.isDecrease ? 'Fiyatlarına Ekle' : 'Fiyatlarından Çıkar'}}
                    </v-list-item>
                  </v-list>
                </v-card>
              </v-menu>
            </template>
          </v-tooltip>
          <EkHelpHint hint="price.rules" class="ppc-help" />
        </template>
      </VCurrencyComponentVue>
    </section>

    <div v-if="channels.length > 1" class="ppc-toolbar">
      <EkButton tone="ghost" size="sm" :icon="allCollapsed ? 'mdi-unfold-more-horizontal' : 'mdi-unfold-less-horizontal'" @click="toggleAll">
        {{ allCollapsed ? 'Tüm kanalları aç' : 'Tüm kanalları kapat' }}
      </EkButton>
    </div>

    <ul class="ppc-channels">
      <li v-for="platform in channels" :key="platform.code" class="ppc-channel">
        <button type="button" class="ppc-channel__head" :aria-expanded="isOpen(platform.code) ? 'true' : 'false'"
          :aria-controls="`${uid}-${platform.code}`" @click="toggle(platform.code)">
          <EkPlatformMark :name="platform.title || platform.code" :code="platform.code" />
          <span class="ppc-channel__summary">
            <EkStatusChip v-if="!hasPrices(platform.code)" tone="warning" label="Fiyat yok" />
            <template v-else>
              <span class="ek-num">Satış {{ money(pricesOf(platform.code).salePrice) }}</span>
              <span class="ppc-channel__sep" aria-hidden="true">·</span>
              <span class="ek-num">Piyasa {{ money(pricesOf(platform.code).marketPrice) }}</span>
            </template>
          </span>
          <v-icon :icon="isOpen(platform.code) ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" aria-hidden="true" />
        </button>
        <div v-if="isOpen(platform.code)" :id="`${uid}-${platform.code}`" class="ppc-channel__body">
          <EkFormGrid v-if="hasPrices(platform.code)" :columns="2">
            <VCurrencyComponentVue @click.stop v-model="pricesOf(platform.code).salePrice"
              :rules="formRules.mandatoryRule" :compact="true" :isIconExist="false"
              :label="$t('productDefinitions.product.variants.salePrice')" clearable :required="true" />
            <VCurrencyComponentVue @click.stop v-model="pricesOf(platform.code).marketPrice"
              :rules="formRules.mandatoryRule" :compact="true" :isIconExist="false"
              :label="$t('productDefinitions.product.variants.marketPrice')" clearable :required="true" />
          </EkFormGrid>
          <div v-else class="ppc-channel__empty">
            <p class="ppc-channel__empty-text">Bu kanal için henüz fiyat girilmedi.</p>
            <EkButton tone="secondary" size="sm" icon="mdi-plus" @click="initPrices(platform.code)">Fiyat gir</EkButton>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import EkHelpHint from '@/components/page/EkHelpHint.vue'
import { ref, computed, useId, onMounted } from 'vue'
import { EkButton, EkFormGrid, EkPlatformMark, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatMoney } from '@entegrasyonik/ui/format'
import useFormRules from '@/composables/formrules'
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';
import { useIntegrationStore } from '@/stores/integrationStore';
const integrationStore = useIntegrationStore()


const batch: any = ref({})
const formRules: any = useFormRules()

const props = defineProps<{
  platformPriceForm: any,
  categoryId: any
}>()

onMounted(() => {
  init()
})

const uid = useId()
const money = (v: any) => formatMoney(Number(v) || 0)
const channels = computed<any[]>(() => [...(integrationStore.getClientMarketplaces() ?? []), ...(integrationStore.getClientECommerces() ?? [])])
const collapsed = ref<Record<string, boolean>>({})
const isOpen = (code: string) => !collapsed.value[code]
const toggle = (code: string) => { collapsed.value = { ...collapsed.value, [code]: isOpen(code) } }
const allCollapsed = computed(() => channels.value.length > 0 && channels.value.every((c: any) => !isOpen(c.code)))
const toggleAll = () => {
  const next: Record<string, boolean> = {}
  for (const c of channels.value) next[c.code] = !allCollapsed.value
  collapsed.value = next
}
const pricesOf = (code: string) => props.platformPriceForm.platforms?.[code]?.prices
const hasPrices = (code: string) => !!pricesOf(code)
// Fiyat kaydı olmayan kanal yalnızca kullanıcı isteğiyle sıfır fiyatla başlatılır (sessiz veri değişikliği yok).
const initPrices = (code: string) => {
  props.platformPriceForm.platforms = props.platformPriceForm.platforms || {}
  props.platformPriceForm.platforms[code] = props.platformPriceForm.platforms[code] || {}
  props.platformPriceForm.platforms[code].prices = { salePrice: 0, marketPrice: 0 }
}

const init = () => {
  initBatch()
}

const initBatch = () => {
  batch.value = {
    isDecrease: false,
    isPercentageAmount: true,
    isSalePrice: true,
    increaseDecreaseAmount: 0,
    price: 0
  }
}

const applyPrices = (mode: string) => {
  var price = 0
  for (let platform of channels.value) {
    if (!hasPrices(platform.code)) continue
    if (batch.value.isSalePrice == true)
      price = props.platformPriceForm.platforms[platform.code].prices.salePrice
    else
      price = props.platformPriceForm.platforms[platform.code].prices.marketPrice
    if (!price) price = 0
    switch (mode) {
      case 'CONSTANT':
        price = batch.value.price
        break
      case 'PERCENTAGE':
        if (batch.value.isDecrease) price -= (price * batch.value.price) / 100
        else price += (price * batch.value.price) / 100
        break
      case 'VALUE':
        if (batch.value.isDecrease) price -= batch.value.price
        else price += batch.value.price
        break
    }
    if (batch.value.isSalePrice == false && batch.value.price != undefined)
      props.platformPriceForm.platforms[platform.code].prices.marketPrice = price
    else if (batch.value.isSalePrice == true && batch.value.price != undefined)
      props.platformPriceForm.platforms[platform.code].prices.salePrice = price
  }
}

defineExpose({
  init
});

</script>

<style scoped>
.ppc-root {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}

.ppc-menu-icon {
  opacity: 0.7;
}

.ppc-toolbar {
  display: flex;
  justify-content: flex-end;
}

.ppc-channels {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ppc-channel {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}

.ppc-channel__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 48px;
  padding: var(--ek-space-2) var(--ek-space-4);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ppc-channel__head:hover {
  background: var(--ek-color-surface-muted);
}

.ppc-channel__head:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ppc-channel__summary {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin-left: auto;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ppc-channel__body {
  padding: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ppc-channel__empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
}

.ppc-channel__empty-text {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

@media (max-width: 599px) {
  .ppc-channel__head {
    flex-wrap: wrap;
  }

  .ppc-channel__summary {
    order: 3;
    width: 100%;
    margin-left: 0;
  }
}
</style>
