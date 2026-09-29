<template>
  <div class="dashboard pt-0">
    <v-card class="dashboard-scroll-surface" variant="flat">
      <v-card-text class="pa-1 ma-0">
        <div class="dashboard-grid ">
          <!-- Sol Sütun -->
          <div class="dashboard-column  pl-1">
            <NavigationLinksComponent />
            <NavigationLinksComponentBottom class="mt-6" />
          </div>

          <!-- Orta Sütun -->
          <div class="dashboard-column middle-column px-4 pt-2">
            <StatisticsComponent class="" />
            <NavigationLinksComponentRight class="mt-4" />
          </div>

          <!-- Sağ Sütun -->
          <div class="dashboard-column pt-2 pr-1">
            <MarketplaceLinksComponent class="" />
            <NavigationLinksComponentLeft class="mt-4" />
          </div>
        </div>

        <div class="dashboard-bottom-row">
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount } from 'vue'
import MarketplaceLinksComponent from '@/components/dashboard/MarketplaceLinksComponent.vue'
import NavigationLinksComponent from '@/components/dashboard/NavigationLinksComponent.vue'

import StatisticsComponent from '@/components/dashboard/StatisticsComponent.vue'
import NavigationLinksComponentRight from '@/components/dashboard/NavigationLinksComponentRight.vue'
import NavigationLinksComponentBottom from '@/components/dashboard/NavigationLinksComponentBottom.vue'
import NavigationLinksComponentLeft from '@/components/dashboard/NavigationLinksComponentLeft.vue'
onBeforeUnmount(() => {

})
</script>

<style scoped>
.dashboard-scroll-surface {
  position: absolute;
  overflow-y: auto;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: transparent;
}

.dashboard-grid {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
}

.dashboard-column {
  flex: 1 1 30%;
  min-width: 320px;
  display: flex;
  flex-direction: column;
}

.middle-column {
  flex: 1.2 1 40%;
}

@media (max-width: 1215px) {
  .dashboard-column {
    flex: 1 1 45%;
  }
}

@media (max-width: 820px) {
  .dashboard-column {
    flex: 1 1 100%;
  }
}

.dashboard-bottom-row {
  width: 100%;
}

.scroll-element::-webkit-scrollbar {
  display: none
}
</style>