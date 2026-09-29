<!--
  frontend/src/views/secure/adminPanel/integrations/EngineSettingsView.vue

  ADR-0020 Karar 4.1 "Motor ayarları" — `admin.engineSettings`, hedef `_engine`, `platformAdmin`.

  Not (ADR-0015 Karar 6.4 desen mandalı): `EkPageHeader` bu dosyada DOĞRUDAN kullanılmaz —
  `IntegrationConfigSettingsBody`'nin sardığı `EkSettingsTemplate` onu İÇİNDE render eder.
-->
<template>
  <div class="engineSettingsView">
   <PlatformAdminGuard :allowed="isPlatformAdmin()">
    <IntegrationConfigSettingsBody target="_engine" target-label="Motor Ayarları" mode="engine" />
   </PlatformAdminGuard>
  </div>
</template>

<script setup lang="ts">
import PlatformAdminGuard from '@/components/adminPanel/integrations/PlatformAdminGuard.vue'
import IntegrationConfigSettingsBody from '@/components/adminPanel/integrations/IntegrationConfigSettingsBody.vue'
import useUser from '@/composables/user'

const { isPlatformAdmin } = useUser()

defineExpose({
  initialize: () => {},
  activate: () => {},
})
</script>

<style scoped>
.engineSettingsView {
  padding: var(--ek-space-6);
}
</style>
