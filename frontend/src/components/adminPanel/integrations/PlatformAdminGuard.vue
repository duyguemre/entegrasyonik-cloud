<!--
  frontend/src/components/adminPanel/integrations/PlatformAdminGuard.vue

  ADR-0020 Karar 4.4 "Durumlar" — "yetkisiz (rota koruması + sunucu 403 → 'Bu ekran yalnız platform
  yöneticileri içindir')". Bu, İSTEMCİ tarafı görünürlük ipucudur (savunma derinliği) —
  ASIL yetki sınırı backend'de `platformAdmin` (`operationPolicy.ts` `resolveTier`, `principal.ga`).
  `allowed` prop'u `useUser().isPlatformAdmin()`'den gelir.
-->
<template>
  <div v-if="!allowed" class="platform-admin-guard" role="alert">
    <v-icon icon="mdi-shield-lock-outline" size="40" class="platform-admin-guard__icon" aria-hidden="true" />
    <p class="platform-admin-guard__message">Bu ekran yalnız platform yöneticileri içindir.</p>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
defineProps<{ allowed: boolean }>()
</script>

<style scoped>
.platform-admin-guard {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-8) var(--ek-space-4);
  min-height: 240px;
}

.platform-admin-guard__icon {
  color: var(--ek-color-content-subtle);
}

.platform-admin-guard__message {
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-muted);
  max-width: 420px;
  margin: 0;
}
</style>
