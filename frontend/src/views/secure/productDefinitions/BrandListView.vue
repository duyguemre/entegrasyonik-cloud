<template>


  <div class="brandDefinition">
    <div class="workarea-scroll">
      <v-row class="mt-0 mb-0 bdv-row">
        <v-col cols="12" sm="6" class="bdv-col">
          <BrandListComponent v-model="isBrandsListed" @openBrandSync="openBrandSync($event)" />
        </v-col>
        <v-col cols="12" sm="6" class="bdv-col">
          <BrandSyncComponent v-model="selectedBrand" />
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, onMounted, onBeforeMount } from 'vue'
import { useMenuStore } from '@/stores/site/menu'
import BrandListComponent from '@/components/BrandListComponent.vue';
import BrandSyncComponent from '@/components/BrandSyncComponent.vue';
import useIntegrations from '@/composables/integrations';
import { useI18n } from 'vue-i18n';
import useRestApi from '@/composables/restapi'
const eventBus: any = inject('eventBus');
const selectedBrand = ref()
const isBrandsListed = ref(true)
const destroyComponent = () => {
  isBrandsListed.value = false
  selectedBrand.value = undefined
}

defineExpose({
  destroyComponent
});


const openBrandSync = (brand: any) => {
  /*   console.log("selectedBrand", brand) */
  selectedBrand.value = brand
}


const { t } = useI18n()


onMounted(() => {
})

</script>

<style scoped>
/* ADR-0015 B5-2 — bu ekran içeriğini kapsam dışı kök bileşenlere (BrandListComponent/
   BrandSyncComponent) devrediyor; kendi görsel sorumluluğu yalnızca iki panelin tam
   yükseklikte yan yana yerleşimi. (Önceki `.navigation-scroll-container1` bloğu şablonda
   HİÇBİR yerde kullanılmıyordu — ölü CSS, literal renk içeriyordu, kaldırıldı; davranış
   değişmedi.) 110px kabuk sekme/başlık şeridinin yüksekliği — ADR-0015 A3 kabuk sabiti. */
.bdv-row {
  height: 100%;
}

/* Faz3 DS-v2 int düzeltme: <600px'te (xs) iki panel alt alta (cols=12, sm=6). Yan yana 375px'te
   liste paneli ~140px'e sıkışıp marka/kategori adları 0 genişliğe düşüyordu (satır başlığı ellipsis). */
.bdv-col {
  height: calc(100vh - 110px);
  position: relative;
}
</style>
