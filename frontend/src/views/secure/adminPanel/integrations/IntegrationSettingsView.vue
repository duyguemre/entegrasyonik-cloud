<!--
  frontend/src/views/secure/adminPanel/integrations/IntegrationSettingsView.vue

  ADR-0020 Karar 4.1 "Entegrasyon ayarları" — `admin.integrationSettings?code=`, `platformAdmin`.

  Not (ADR-0015 Karar 6.4 desen mandalı): `EkPageHeader` bu dosyada DOĞRUDAN kullanılmaz —
  `IntegrationConfigSettingsBody`'nin sardığı `EkSettingsTemplate` onu İÇİNDE render eder.
-->
<template>
  <div class="integrationSettingsView">
   <PlatformAdminGuard :allowed="isPlatformAdmin()">
    <EkEmptyState v-if="!code" variant="no-data" title="Entegrasyon seçilmedi" message="Bu ekran bir entegrasyon kodu (?code=) ile açılmalıdır. Entegrasyonlar listesinden bir satır seçin." />
    <IntegrationConfigSettingsBody v-else :key="code" :target="code" :target-label="targetLabel" mode="integration" />
   </PlatformAdminGuard>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { EkEmptyState } from '@entegrasyonik/ui/components'
import PlatformAdminGuard from '@/components/adminPanel/integrations/PlatformAdminGuard.vue'
import IntegrationConfigSettingsBody from '@/components/adminPanel/integrations/IntegrationConfigSettingsBody.vue'
import useUser from '@/composables/user'

const KNOWN_CODES = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap']
const { isPlatformAdmin } = useUser()

const code = ref<string | null>(null)
const targetLabel = computed(() => (code.value ? code.value.charAt(0).toUpperCase() + code.value.slice(1) : ''))

function applyParameters(parameters: any) {
  const c = parameters?.code
  code.value = typeof c === 'string' && KNOWN_CODES.includes(c) ? c : null
}

const initialize = (parameters?: any) => applyParameters(parameters)
const activate = (parameters?: any) => applyParameters(parameters)
defineExpose({ initialize, activate })
</script>

<style scoped>
.integrationSettingsView {
  padding: var(--ek-space-6);
}
</style>
