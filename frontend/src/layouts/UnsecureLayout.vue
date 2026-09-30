<template>
  <v-layout class="rounded rounded-md">
    <v-main>
      <!-- FE-CFG-2: bakım şeridi giriş/şifre ekranlarında da görünür (kimliksiz public-config); uygulamayı kilitlemez. -->
      <ShellNoticeBanner v-if="maintenanceNoticeModel" class="ek-unsecure-notice" :model="maintenanceNoticeModel" />
      <router-view></router-view>
    </v-main>

  </v-layout>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import ShellNoticeBanner from '@/components/layout/ShellNoticeBanner.vue'
import { maintenanceNotice } from '@/components/layout/shellNotice'
import { usePublicConfigStore } from '@/stores/publicConfig'

const publicConfig = usePublicConfigStore()
const maintenanceNoticeModel = computed(() => (publicConfig.maintenance ? maintenanceNotice(publicConfig.maintenance.message) : null))
</script>

<style>
.ek-unsecure-notice {
  position: relative;
  z-index: var(--ek-z-sticky);
}
</style>
