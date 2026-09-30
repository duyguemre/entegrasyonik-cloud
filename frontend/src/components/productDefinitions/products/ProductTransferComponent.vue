<template>


  <v-card variant="elevated" class="pt-panel ma-0 pa-0" elevation="1" @click.stop :ripple="false"
    :height="computedSize.height" :width="computedSize.width">



    <v-card-title>

      <div class="pt-panel__topline elevation-1">
      </div>

      <v-btn class="pt-panel__close pt-panel__close--right"
        @click="transferProductForm.transferProductFormMenu = false" elevation="1" min-width="0" color="error"><v-icon
          size="x-large">mdi-close</v-icon></v-btn>

      <v-btn class="pt-panel__close pt-panel__close--left"
        @click="transferProductForm.transferProductFormMenu = false" elevation="1" min-width="0" color="error"><v-icon
          size="x-large">mdi-close</v-icon></v-btn>

      <v-icon class="pt-panel__title-icon mr-2 ml-10">mdi-connection</v-icon>{{
        $t('productDefinitions.product.transfer')
      }}

    </v-card-title>



    <v-form ref="transferProductFormRef" v-model="istransferProductFormValid">

      <v-card v-if="transferProductForm" class="pt-panel__body"
        variant="flat">
        <v-card-text>





          <div class="pt-panel__ghost">
            <div class="animated-icon d-flex">


              <div class="d-flex align-center"
                :class="{ 'pt-panel__product--offsale': transferProductForm.transferProduct.onsale == false }">
                <div class="pt-panel__thumb text-center mr-4 elevation-0" @click="">
                  <v-tooltip location="bottom" open-delay="1000" text="Ürünü düzenlemek için basınız">
                    <template v-slot:activator="{ props: tooltipProps }">
                      <ProductImageComponent v-bind="tooltipProps" :productId="transferProductForm.transferProduct._id"
                        v-model="transferProductForm.transferProduct.images[0]" class="pt-panel__clickable" />
                    </template>
                  </v-tooltip>
                </div>
                <div>
                  <span class="font-weight-bold text-body-2">{{ transferProductForm.transferProduct.title }}</span>
                  <div class="d-flex">
                    <div class="pt-panel__meta">
                      <div class="pt-panel__label font-weight-light text-caption mt-1">
                        Stok
                        Kodu
                      </div>
                      <span class="font-weight-bold">{{ transferProductForm.transferProduct.stockcode }}</span>
                      <div class="pt-panel__label font-weight-light text-caption mt-1">
                        Barkod
                      </div>
                      <span class="font-weight-medium">{{ transferProductForm.transferProduct.barcode }}&nbsp</span>
                    </div>
                  </div>
                  <div class="d-flex">
                    <span class="font-weight-normal text-caption">{{ transferProductForm.transferProduct.variants.length
                    }} Ürün
                      Seçeneği</span>
                    <span class="font-weight-normal text-caption ml-4">{{
                      transferProductForm.transferProduct.images.length }}
                      Resim</span>
                  </div>
                </div>
              </div>

            </div>
          </div>


          <div class="d-flex align-center"
            :class="{ 'pt-panel__product--offsale': transferProductForm.transferProduct.onsale == false }">
            <div class="pt-panel__thumb text-center mr-4 elevation-0" @click="">
              <v-tooltip location="bottom" open-delay="1000" text="Ürünü düzenlemek için basınız">
                <template v-slot:activator="{ props: tooltipProps }">
                  <ProductImageComponent v-bind="tooltipProps" :productId="transferProductForm.transferProduct._id"
                    v-model="transferProductForm.transferProduct.images[0]" class="pt-panel__clickable" />
                </template>
              </v-tooltip>
            </div>
            <div>
              <span class="font-weight-bold text-body-2">{{ transferProductForm.transferProduct.title }}</span>
              <div class="d-flex">
                <div class="pt-panel__meta">
                  <div class="pt-panel__label font-weight-light text-caption mt-1">Stok
                    Kodu
                  </div>
                  <span class="font-weight-bold">{{ transferProductForm.transferProduct.stockcode }}</span>
                  <div class="pt-panel__label font-weight-light text-caption mt-1">
                    Barkod
                  </div>
                  <span class="font-weight-medium">{{ transferProductForm.transferProduct.barcode }}&nbsp</span>
                </div>
              </div>
              <div class="d-flex">
                <span class="font-weight-normal text-caption">{{ transferProductForm.transferProduct.variants.length }}
                  Ürün
                  Seçeneği</span>
                <span class="font-weight-normal text-caption ml-4">{{ transferProductForm.transferProduct.images.length
                }}
                  Resim</span>
              </div>
            </div>
          </div>


          <div class="pt-panel__platforms pt-2 d-flex flex-wrap">
            <div v-for="platform of platforms" :key="platform.code" class="pa-2">
              <IntegrationAvatarComponent :platform="platform" :width="'100px'" :height="'100px'" @click=""
                class="pt-panel__clickable" />
            </div>
          </div>

        </v-card-text>
      </v-card>
      <div class="pt-panel__footer pa-4">
        <v-row>
          <v-col>
            <v-btn-group elevation="1" class="d-block" density="compact">
              <v-btn density="compact" block class="fill-height" color="neutral"
                @click="resetTransferProductForm">
                <span class="">
                  <v-icon size="30">mdi-undo-variant</v-icon> {{ $t('common.clear') }}
                </span></v-btn>
            </v-btn-group>
          </v-col>
          <v-col>
            <v-btn-group elevation="1" class="d-block" density="compact">
              <v-btn density="compact" block class="fill-height" color="primary"
                @click="validateAndSearchProducts">
                <span class="">
                  <v-icon size="30">mdi-content-save-outline</v-icon> {{ $t('common.save') }}
                </span></v-btn>
            </v-btn-group>
          </v-col>
        </v-row>

      </div>
    </v-form>
  </v-card>
</template>

<script setup lang="ts">
import { ref, inject, nextTick, watch, computed, onActivated, onBeforeMount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n';
import { useChoicesStore } from '@/stores/choicesStore';
import useFormRules from '@/composables/formrules';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useDisplay } from 'vuetify'
import IntegrationAvatarComponent from '@/components/IntegrationAvatarComponent.vue';
import ProductImageComponent from './ProductImageComponent.vue';
const { name } = useDisplay()


const choicesStore = useChoicesStore()
var choicesStoreChoices: any = undefined
const formRules = useFormRules()
const transferProductFormMenu = ref(false)
const istransferProductFormValid = ref(false)
const transferProductFormRef: any = ref(null)
const transferProductForm: any = defineModel({ default: { transferProductFormMenu: false, onsale: true } })
const { t } = useI18n()
const integrationStore: any = useIntegrationStore()

const emits = defineEmits(['transferProducts'])

var props = defineProps<{
  isFiltered: boolean,
}>()
onMounted(() => {
  choicesStoreChoices = choicesStore.getChoices()
})


const platforms = computed(() => {
  return integrationStore.getClientMarketplaces().filter((item: any) => item.type.code == 'marketplace')
})


const resetTransferProductForm = () => {
  transferProductForm.value.choices = {}
  transferProductForm.value.isPlatformBasedPrice = 0
  transferProductForm.value.stockcode = undefined
  transferProductForm.value.title = undefined
  transferProductForm.value.saleStatus = false
  transferProductForm.value.max = undefined
  transferProductForm.value.min = undefined
  transferProductForm.value.onsale = true
  transferProductForm.value.productLoaded = false
  transferProductForm.value.category = -1
  transferProductForm.value.brand = -1
  transferProductForm.value.barcode = undefined
  transferProductForm.value.stock = undefined
  transferProductForm.value.shelf = undefined

}


const computedSize: any = computed(() => {
  switch (name.value) {
    case 'xs': return { height: '100vh', width: '100vw' }
    case 'sm': return { height: '90vh', width: '90vw' }
    case 'md': return { height: '80vh', width: '80vw' }
    case 'lg': return { height: '70vh', width: '70vw' }
    case 'xl': return { height: '60vh', width: '60vw' }
    case 'xxl': return { height: '50vh', width: '50vw' }
  }
  return { height: '50vh', width: '50vw' }
})


const validateAndSearchProducts = async () => {
  await transferProductFormRef.value?.validate()
  if (istransferProductFormValid.value == false) return
  emits('transferProducts', true)
  transferProductForm.value.transferProductFormMenu = false
}

</script>

<style scoped>
.pt-panel {
  position: absolute;
  transition: none !important;
  box-shadow: none;
  transform: none !important;
  right: var(--ek-space-2);
  bottom: var(--ek-space-2);
  top: var(--ek-space-2);
  background-color: var(--ek-color-surface-sunken);
}

.pt-panel__topline {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  width: auto;
  opacity: 0.9;
  background-color: var(--ek-color-error);
}

.pt-panel__close {
  position: absolute;
  top: 0;
  height: var(--ek-control-h-lg);
  width: var(--ek-control-h-lg);
  opacity: 0.9;
  border-radius: var(--ek-radius-none);
}

.pt-panel__close--right {
  right: 0;
  border-bottom-left-radius: var(--ek-radius-xl);
}

.pt-panel__close--left {
  left: 0;
  border-bottom-right-radius: var(--ek-radius-xl);
}

.pt-panel__title-icon {
  opacity: 0.7;
}

.pt-panel__body {
  position: absolute;
  overflow-y: scroll;
  top: var(--ek-space-12);
  left: 0;
  right: 0;
  bottom: 70px;
  border-top: 1px solid var(--ek-color-border-default);
  background-color: var(--ek-color-surface-muted);
}

.pt-panel__ghost {
  position: absolute;
  width: 100%;
  z-index: -1;
  height: 210px;
}

.pt-panel__product--offsale {
  background-color: var(--ek-color-error-subtle);
  border-right: 2px solid var(--ek-color-border-default) !important;
}

.pt-panel__thumb {
  position: relative;
  width: 110px;
  min-width: 110px;
  border: 1px solid var(--ek-color-border-strong);
}

.pt-panel__clickable {
  cursor: pointer;
}

.pt-panel__meta {
  min-width: 130px;
}

.pt-panel__label {
  line-height: 0.7;
  font-size: var(--ek-type-micro-size) !important;
}

.pt-panel__platforms {
  margin-top: 100px;
}

.pt-panel__footer {
  position: absolute;
  bottom: 0;
  width: 100%;
  border-top: 1px solid var(--ek-color-border-default);
}

.animated-arrow {
  animation: dash-move 1s linear infinite;
}

.animated-icon {
  animation: icon-move 8s var(--ek-easing-standard) infinite;
}

@keyframes icon-move {
  0% {
    margin-top: 0px;
    opacity: 0;
    scale: 1;
  }

  30% {
    margin-top: 120px;
    opacity: .8;
    scale: 1
  }

  70% {
    margin-top: 220px;
    opacity: 0;
    left: 0;
    position: absolute;
    scale: 0
  }

  100% {
    opacity: 0
  }
}


@keyframes dash-move {
  100% {
    stroke-dashoffset: 0;
  }

  0% {
    stroke-dashoffset: 20;
  }
}
</style>
