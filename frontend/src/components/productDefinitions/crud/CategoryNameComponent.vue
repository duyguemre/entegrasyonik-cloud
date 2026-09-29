<template>



<v-dialog
        v-model="dialog"
        activator="parent"
        width="50%"
      >
        <v-card>
          <v-card-text>
            <v-text-field clearable  density="comfortable" class="mr-4 pt-2"
              :label="$t('productDefinitions.category.new.title')" variant="outlined" bg-color="textfieldColor">
            </v-text-field>
      
          </v-card-text>
          <v-card-actions>
            <v-btn color="primary" block @click="dialog = false">Kapat</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

<!--   <div class="d-flex  align-center">
    <div>
      <div class="text-truncate mb-2" :style="{ 'width': contentWidth + 'px!important' }">

        <v-select clearable density="compact" class="mr-4 pt-2" hide-details
          :label="$t('productDefinitions.category.new.title')" variant="outlined" bg-color="textfieldColor">
        </v-select>


      </div>
      <div class="text-truncate" :style="{ 'width': contentWidth + 'px!important' }">
        <v-select clearable density="compact" class="mr-4 pt-1" hide-details
          :label="$t('productDefinitions.category.new.title')" variant="outlined" bg-color="textfieldColor">
        </v-select>

      </div>
      <v-divider class="mb-3 mr-3" />
      <div class="text-truncate" :style="{ 'width': contentWidth + 'px!important' }">
        <v-select clearable density="compact" class="mr-4 pt-1" hide-details
          :label="$t('productDefinitions.category.new.title')" variant="outlined" bg-color="textfieldColor">
        </v-select>

      </div>
      <v-divider class="mb-3  mr-3" />
      <div class="text-truncate" :style="{ 'width': contentWidth + 'px!important' }">
        <v-select clearable density="compact" class="mr-4 pt-1" hide-details
          :label="$t('productDefinitions.category.new.title')" variant="outlined" bg-color="textfieldColor">
        </v-select>

      </div>
    </div>
  </div>
 --></template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, onMounted, watch } from 'vue'

var dialog = ref(false)
const { t } = useI18n()
var sliderValue = ref(0)
var sliderMax = ref(0)
var contentWidth = 300
const headers = [
  {
    id: 1,
    title: t('productDefinitions.category.headers.category'),
    value: "name"
  },
  {
    id: 1,
    title: "platform",
    value: "platform"
  },
]

const dynamicHeaders = [
  "hepsiburada",
  "trendyol",
  "amazon",
  "pazarama",
  "pttavm",
  "ciceksepeti",
  "n11",
  "akakce",

]
const items = [
  {
    name: "Hakiki Kadın Babet Ayakkabı",
    platform: "1",
    hepsiburada: { category: 'HBabet 32423 423 423 432 4 234343 ', color: 'Renk', size: 'Beden', number: 'Numara' },
    trendyol: { category: 'TBabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    amazon: { category: 'ABabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pazarama: { category: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pttavm: { category: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    ciceksepeti: { category: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    n11: { category: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    akakce: { category: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },

  },

]

onMounted(() => {
  const contentScroll = document.querySelector('.content-scroll-container');
  if (contentScroll?.scrollWidth)
    sliderMax.value = contentScroll?.scrollWidth - contentScroll?.clientWidth + 0
});

watch(sliderValue, (newValue, oldValue) => {
  const contentScrolls = document.querySelectorAll('.content-scroll-container');
  contentScrolls.forEach((contentScroll) => {
    contentScroll.scrollLeft = sliderValue.value;
  })
});
</script>

<style>

</style>