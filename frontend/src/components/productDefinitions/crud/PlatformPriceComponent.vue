<template>
  <v-row class="fill-height ppc-s1">
    <v-col class="pb-0">
      <div class="fill-height ppc-s2">
        <div v-for="(platform, index) of [...integrationStore.getClientMarketplaces(),...integrationStore.getClientECommerces()]" class="pa-2 ppc-s3">
          <VCurrencyComponentVue v-if="index == 0" prepend-icon="mdi-currency-try" @click.stop v-model="batch.price"
            :compact="false" label="Toplu Fiyat Atama" clearable :required="false"
            hint="Fiyatları toplu olarak değiştirmek için miktar ya da yüzdelik oran giriniz" class="mb-2 mt-3"
            :hide-details="false" counter>
            <template #append-inner>
              <v-tooltip open-delay="1000" :text="$t('productDefinitions.product.define.applyPricesDesc')">
                <template v-slot:activator="{ props }">
                  <v-menu>
                    <template v-slot:activator="{ props }">
                      <v-btn v-bind="props" elevation=0 color="neutral">
                        Uygula <v-icon size="large">mdi-menu-down</v-icon>
                      </v-btn>
                    </template>
                    <v-card width="350" class="pb-0 pt-0">
                      <v-list density="compact" class="pa-0">

                        <v-list-item>
                          <template #prepend>
                          </template>
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
                          <template #prepend>
                          </template>
                          <v-checkbox label="Çıkar" density="compact" @click.stop hide-details
                            v-model="batch.isDecrease" class="text-right justify-start d-flex" />
                        </v-list-item>
                        <v-divider thickness="2" />
                        <v-list-item @click="applyPrices('CONSTANT')">
                          <template #prepend>
                            <v-icon color="primary" class="ppc-s4">mdi-currency-try</v-icon>
                          </template>
                          {{ batch.isSalePrice ? 'Satış' : 'Piyasa' }} Fiyatlarına Ata
                        </v-list-item>
                        <v-divider />
                        <v-list-item @click="applyPrices('PERCENTAGE')">
                          <template #prepend>
                            <v-icon color="content-muted" class="ppc-s4">mdi-percent</v-icon>
                          </template>
                          Yüzdelik Olarak {{ batch.isSalePrice ? 'Satış' : 'Piyasa' }} {{ !batch.isDecrease ? 'Fiyatlarına Ekle':'Fiyatlarından Çıkar'}}
                        </v-list-item>
                        <v-divider />
                        <v-list-item @click="applyPrices('VALUE')">
                          <template #prepend>
                            <v-icon color="primary" class="ppc-s4">{{ !batch.isDecrease ? 'mdi-plus' : 'mdi-minus' }}</v-icon>
                          </template>
                          {{ batch.isSalePrice ? 'Satış' : 'Piyasa' }} {{ !batch.isDecrease ? 'Fiyatlarına Ekle' : 'Fiyatlarından Çıkar'}}
                        </v-list-item>
                      </v-list>
                    </v-card>
                  </v-menu>


                </template>
              </v-tooltip>
            </template>
          </VCurrencyComponentVue>



          <v-row v-if="index == 0 && false">
            <v-col>
              <v-list v-model:opened="open" class="pa-0 ma-0 elevation-1 ppc-s5" rounded>

                <v-list-group value="batch">
                  <template v-slot:activator="{ props }">
                    <v-list-item v-bind="props" class="pl-1 pr-2 ppc-s6" title="Toplu İşlemler">
                      <template #prepend>
                        <v-icon color="content-muted">mdi-card-multiple-outline</v-icon>
                      </template>
                      <template #title>
                        <span class="font-weight-medium ppc-s7">
                          Toplu İşlemler
                        </span>
                      </template>
                    </v-list-item>
                    <v-divider />
                  </template>

                  <v-list-item class="pa-4 ppc-s8">

                    <v-row>
                      <v-col>
                        <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop v-model="batch.price"
                          :compact="false" :label="$t('productDefinitions.product.define.price')" clearable
                          :required="false" :hint="$t('productDefinitions.product.define.priceDesc')" class="mb-2 mt-3"
                          :hide-details="false" counter>
                          <template #append-inner>
                            <v-tooltip open-delay="1000"
                              :text="$t('productDefinitions.product.define.applyPricesDesc')">
                              <template v-slot:activator="{ props }">
                                <v-menu>
                                  <template v-slot:activator="{ props }">
                                    <v-btn v-bind="props" elevation=0 color="neutral">
                                      Uygula <v-icon size="large">mdi-menu-down</v-icon>
                                    </v-btn>
                                  </template>
                                  <v-card width="350" class="pb-0 pt-0">
                                    <v-list density="compact" class="pa-0">

                                      <v-list-item>
                                        <template #prepend>
                                        </template>
                                        <v-radio-group inline hide-details v-model="batch.isSalePrice" density="compact"
                                          @click.stop>
                                          <v-radio :value="true" density="compact"
                                            :label="$t('productDefinitions.product.define.salePrice')">
                                          </v-radio>
                                          <v-radio :value="false" density="compact"
                                            :label="$t('productDefinitions.product.define.marketPrice')">
                                          </v-radio>
                                        </v-radio-group>
                                      </v-list-item>

                                      <v-list-item>
                                        <template #prepend>
                                        </template>
                                        <v-checkbox label="Çıkar" density="compact" @click.stop hide-details
                                          v-model="batch.isDecrease" class="text-right justify-start d-flex" />
                                      </v-list-item>
                                      <v-divider thickness="2" />
                                      <v-list-item @click="">
                                        <template #prepend>
                                          <v-icon color="primary" class="ppc-s4">mdi-currency-try</v-icon>
                                        </template>
                                        {{ batch.isSalePrice ? 'Satış' : 'Piyasa' }} Fiyatlarına Ata
                                      </v-list-item>
                                      <v-divider />
                                      <v-list-item @click="">
                                        <template #prepend>
                                          <v-icon color="content-muted" class="ppc-s4">mdi-percent</v-icon>
                                        </template>
                                        Yüzdelik Olarak {{ batch.isSalePrice ? 'Satış' : 'Piyasa' }}
                                        {{ !batch.isDecrease ? 'Fiyatlarına Ekle':'Fiyatlarından Çıkar'}}
                                      </v-list-item>
                                      <v-divider />
                                      <v-list-item @click="">
                                        <template #prepend>
                                          <v-icon color="primary" class="ppc-s4">{{ !batch.isDecrease ? 'mdi-plus' : 'mdi-minus' }}</v-icon>
                                        </template>
                                        {{ batch.isSalePrice ? 'Satış' : 'Piyasa' }} {{ !batch.isDecrease ? 'Fiyatlarına Ekle':'Fiyatlarından Çıkar'}}
                                      </v-list-item>
                                    </v-list>
                                  </v-card>
                                </v-menu>


                              </template>
                            </v-tooltip>
                          </template>
                        </VCurrencyComponentVue>

                      </v-col>
                      <v-col v-if="false">

                        <v-row>
                          <v-col class="pl-2">
                            <v-radio-group hide-details inline v-model="batch.isPercentageAmount" density="compact">
                              <v-radio :value="true" density="compact"
                                :label="$t('productDefinitions.product.define.marketPrice')">
                                <template #label>
                                  <v-icon size="small">mdi-percent</v-icon>
                                </template>
                              </v-radio>
                              <v-radio :value="false" density="compact"
                                :label="$t('productDefinitions.product.define.salePrice')">
                                <template #label>
                                  <v-icon size="small">mdi-currency-try</v-icon>
                                </template>
                              </v-radio>
                            </v-radio-group>
                          </v-col>
                          <v-col>
                            <v-checkbox :label="$t('productDefinitions.product.define.decreasePrice')" density="compact"
                              hide-details v-model="batch.isDecrease" class="text-right justify-end d-flex" />
                          </v-col>
                        </v-row>
                        <VCurrencyComponentVue
                          :prepend-icon="batch.isPercentageAmount ? 'mdi-currency-try' : 'mdi-percent'" @click.stop
                          v-model="batch.increaseDecreaseAmount" :compact="false"
                          :label="$t('productDefinitions.product.define.amount')" clearable :required="false"
                          :hint="$t('productDefinitions.product.define.amountDesc')" class="mb-2 mt-3"
                          :hide-details="false" counter>
                          <template #append-inner>
                            <v-tooltip open-delay="1000"
                              :text="$t('productDefinitions.product.define.applyIncreaseDecreasePricesDesc')">
                              <template v-slot:activator="{ props }">
                                <v-btn-group elevation="1" class="d-block" v-bind="props" density="compact">
                                  <v-btn density="compact" block class="fill-height" color="neutral"
                                    @click="applyIncreaseDecreasePrices">
                                    <span class="">
                                      {{ $t('common.apply') }}
                                    </span></v-btn>
                                </v-btn-group>
                              </template>
                            </v-tooltip>
                          </template>
                        </VCurrencyComponentVue>
                      </v-col>
                    </v-row>
                  </v-list-item>
                </v-list-group>
              </v-list>
            </v-col>
          </v-row>

          <v-row v-if="platformPriceForm.platforms[platform.code].prices">
            <v-col>
              <div class="d-flex justify-center  align-center row-title">
          <v-sheet
            class="mt-0 mr-0 mb-0 ml-0 mr-0 pa-3 text-center d-flex justify-center elevation-1 ppc-s9"
            :style="{'background-color': platform.color}">
            <v-img :width="platform.width"
              :src="integrationStore.getIntegrationImagePath(platform)"></v-img>
          </v-sheet>



                <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop
                  v-model="platformPriceForm.platforms[platform.code].prices.salePrice" :rules="formRules.mandatoryRule"
                  :compact="true" :label="$t('productDefinitions.product.variants.salePrice')" clearable
                  :required="true" class="ml-2 ppc-s10">
                </VCurrencyComponentVue>
                <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop
                  v-model="platformPriceForm.platforms[platform.code].prices.marketPrice"
                  :rules="formRules.mandatoryRule" :compact="true"
                  :label="$t('productDefinitions.product.variants.marketPrice')" clearable :required="true" class="ml-4 ppc-s10">
                </VCurrencyComponentVue>
              </div>
            </v-col>
          </v-row>
        </div>
      </div>
      <!--       </div> -->
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref, inject, computed, onBeforeMount, onBeforeUnmount, onMounted, onActivated, onDeactivated } from 'vue'
import useIntegrations from '@/composables/integrations';
import { useI18n } from 'vue-i18n';
import useFormRules from '@/composables/formrules'
import usePriceCalculator from '@/composables/priceCalculator';
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';
import { useIntegrationStore } from '@/stores/integrationStore';
const integrationStore = useIntegrationStore()


const batch: any = ref({})
const formRules: any = useFormRules()
const { t } = useI18n()
const integrations: any = useIntegrations()
const open: any = ref()

/* var platformPriceForm = defineModel({ default: undefined })
 */
const props = defineProps<{
  platformPriceForm: any,
  categoryId: any
}>()

onMounted(() => {
  init()
})

const init = () => {
  /*   createPlatformPrices() */
  initBatch()
}

// R4/T-03 (docs/FRONTEND_CODE_AUDIT.md): bu fonksiyon şablondan HİÇ ÇAĞRILMIYOR (doğrulandı — tek
// çağırıcı `init()` içinde yorum satırı: `/* createPlatformPrices() */`; başka hiçbir bileşen bu
// fonksiyonu import/çağırmıyor). `integrationStore.getIntegrationCategoryIdFromCategoryId()` store'da
// YOK (vue-tsc TS2339); niyeti (ürün kategorisinden platform kategorisine eşleme — komisyonlu fiyat
// hesabı, BR-10) doğrulanamadı ve ürün kararı gerektiriyor (§9.2). R4 kuralı gereği var olmayan bir
// metoda uydurma çağrı bağlanmadı; ölü/erişilemeyen bu kod yolunda kırık çağrı KALDIRILDI (fonksiyonun
// kendisi R1/R2 ölü kod kapsamına girer, silinmedi). Komisyon hesabı bu fonksiyon aktive edilmeden
// önce insan kararı + karakterizasyon testi (BR-10) gerektirir.
const createPlatformPrices = async (aggressiveMode: any = false) => {
  for (let platform of [...integrationStore.getClientMarketplaces(),...integrationStore.getClientECommerces()]) {
    if (props.platformPriceForm.prices[platform.code] && !aggressiveMode) continue

    var salePrice = props.platformPriceForm.prices.salePrice
    var marketPrice = props.platformPriceForm.prices.marketPrice


    if (!props.platformPriceForm.prices) props.platformPriceForm.prices = {}
    if (!props.platformPriceForm.prices[platform.code]) {
      props.platformPriceForm.prices[platform.code] = { salePrice: 0, marketPrice: 0 }
      props.platformPriceForm.prices[platform.code].salePrice = salePrice
      props.platformPriceForm.prices[platform.code].marketPrice = marketPrice
    }
    if (!props.platformPriceForm.prices[platform.code].marketPrice)
      props.platformPriceForm.prices[platform.code].marketPrice = marketPrice
  }
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
  for (let platform of [...integrationStore.getClientMarketplaces(),...integrationStore.getClientECommerces()]) {
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

const applyIncreaseDecreasePrices = () => {
  for (let platform of integrations.getClientMarketplaces()) {
    let price = props.platformPriceForm.prices[platform.code].salePrice
    if (batch.value.isSalePrice == false) {
      price = props.platformPriceForm.prices[platform.code].marketPrice
    }

    let amount = 10
    if (batch.value.isPercentageAmount == true) {
      amount = price * batch.value.increaseDecreaseAmount / 100
    } else {
      amount = batch.value.increaseDecreaseAmount
    }

    console.log(batch.value)
    if (batch.value.isDecrease == true) {
      amount *= -1
    }
    if (batch.value.isSalePrice == false)
      props.platformPriceForm.prices[platform.code].marketPrice += amount
    else
      props.platformPriceForm.prices[platform.code].salePrice += amount

  }
}

defineExpose({
  init
});

</script>

<style></style>

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.ppc-s1 {
  min-height: 500px;
}

.ppc-s2 {
  position: relative !important;
}

.ppc-s3 {
  border-bottom: 1px solid var(--ek-color-border-default) !important;
}

.ppc-s4 {
  opacity: .7 !important;
}

.ppc-s5 {
  background-color: transparent !important;
  border: 1px solid white !important;
}

.ppc-s6 {
  border-radius: 0px !important;
  min-height: 30px !important;
  font-size: .9em !important;
}

.ppc-s7 {
  font-size: .9em !important;
}

.ppc-s8 {
  padding-inline-start: 16px !important;
}

.ppc-s9 {
  cursor: pointer !important;
  border-radius: 5px !important;
  border: 1px solid white !important;
  width: 120px !important;
  height: 60px !important;
}

.ppc-s10 {
  min-width: 200px !important;
}
</style>
