<template>
  <v-app>
    <div v-if="session.state.status === 'booting' && route.meta.public !== true" class="bo-boot" role="status" aria-live="polite">
      <EkBrandLogo :size="36" variant="mark" />
      <span>Oturum kontrol ediliyor…</span>
    </div>
    <RouterView v-else />
    <ReauthDialog />
    <ToastHost />
  </v-app>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useTheme } from 'vuetify'
import { EkBrandLogo } from '@entegrasyonik/ui/components'
import ReauthDialog from '@bo/components/ReauthDialog.vue'
import ToastHost from '@bo/components/ToastHost.vue'
import { session } from '@bo/auth/session'
import { bindTheme } from '@bo/theme'

const route = useRoute()
bindTheme(useTheme())
</script>

<style scoped>
.bo-boot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-3);
  min-height: 100vh;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}
</style>
