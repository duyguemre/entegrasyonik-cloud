<template>


  <div class="brandDefinition">
    <div class="workarea-scroll">

      <v-row style="height:100%" class="mt-0 mb-0">
        <v-col style="height:calc(100vh - 110px);position:relative">
          <BrandListComponent v-model="isBrandsListed" @openBrandSync="openBrandSync($event)" />
        </v-col>
        <v-col style="height:calc(100vh - 110px);position:relative">
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
.navigation-scroll-container1::-webkit-scrollbar {
  display: none !important
}

.navigation-scroll-container1 {
  position: absolute;
  transition: all .1s ease;
  border-radius: 0px;
  border-top: 0px solid #aaa;
  overflow-y: scroll;
  overflow-x: hidden;
  bottom: 20px;
  top: 10px;
  left: 0px;
  right: 50%;
  width: auto;
}
</style>
