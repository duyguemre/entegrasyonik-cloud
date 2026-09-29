<template>
  <div class="logListView pt-2 h-100">
    <v-card elevation="0" class="transparent-tabs-container mb-2">
      <v-tabs v-model="activeTab" color="primary" align-tabs="start" density="compact" class="premium-tabs" height="45"
        hide-slider>
        <v-tab value="export" class="text-none font-weight-bold tab-item" :ripple="false">
          <v-icon start size="20">mdi-cloud-upload-outline</v-icon>
          Ürün Gönderim İşlemleri
          <div class="active-indicator"></div>
        </v-tab>

        <v-tab value="import" class="text-none font-weight-bold tab-item" :ripple="false">
          <v-icon start size="20">mdi-cloud-download-outline</v-icon>
          Ürün Çekim İşlemleri
          <div class="active-indicator"></div>
        </v-tab>
      </v-tabs>
      <v-divider></v-divider>
    </v-card>

    <template v-if="activeTab === 'import'">
      <ImportLogList />
    </template>
    <template v-else>
      <ExportLogList />
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ImportLogList from '@/components/logListView/ImportLogList.vue';
import ExportLogList from '@/components/logListView/ExportLogList.vue';

// Default olarak "Ürün Gönderim İşlemleri" seçili geliyor
const activeTab = ref('export');
</script>

<style scoped>
/* GİZLİ DAVRANIŞ (kod DEĞİŞTİRİLMEDİ): bu sınıf hiçbir template düğümünde
   KULLANILMIYOR (ölü CSS) — BACKLOG.md'ye not düşüldü. */
.desktop-loglistView {
  position: absolute;
  top: 75px;
  bottom: 0;
  left: 0;
  right: 0;
  width: auto;
  height: auto;
  border: 1px solid var(--ek-color-border-color);
  background-color: var(--ek-color-surface) !important;
}


.logListView {
  background-color: transparent;
}

/* PREMIUM TAB TASARIMI */
.premium-tabs :deep(.v-slide-group__content) {
  padding-left: 8px;
}

.tab-item {
  letter-spacing: 0.5px;
  font-size: 0.9rem;
  color: #757575 !important;
  transition: all var(--ek-duration-slow) var(--ek-easing-standard);
  position: relative;
  opacity: 0.7;
}

.tab-item.v-tab--selected {
  color: var(--ek-color-passive-color) !important;
  opacity: 1;
}

/* Aktif tab altındaki özel indicator çizgisi */
.active-indicator {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 2px;
  background: var(--ek-color-passive-color);
  transition: all var(--ek-duration-slow) var(--ek-easing-standard);
  transform: translateX(-50%);
  border-radius: 3px 3px 0 0;
  box-shadow: 0 -2px 10px rgba(var(--v-theme-passiveColor), 0.2);
}

.tab-item.v-tab--selected .active-indicator {
  width: 80%;
}

.transparent-tabs-container {
  background: transparent !important;
}

/* İçerik geçiş animasyonu için — premium-ui-standards motion sınırı
   (150 ms – 300 ms, yalnızca ease-in-out/ease-out; bounce/elastik eğri YASAK)
   aşılıyordu (400 ms + cubic-bezier overshoot), --ek-duration-slow'a çekildi. */
.v-window {
  transition: var(--ek-duration-slow) var(--ek-easing-standard);
}
</style>