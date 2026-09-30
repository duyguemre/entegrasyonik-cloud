<template>
  <v-app>
    <EkBootScreen v-if="session.state.status === 'booting' && route.meta.public !== true" label="Oturum kontrol ediliyor…" product="Yönetim" />
    <RouterView v-else />
    <ReauthDialog />
    <EkToastHost />
  </v-app>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useTheme } from 'vuetify'
import { EkBootScreen, EkToastHost } from '@entegrasyonik/ui/components'
import ReauthDialog from '@bo/components/ReauthDialog.vue'
import { session } from '@bo/auth/session'
import { bindTheme } from '@bo/theme'

const route = useRoute()
bindTheme(useTheme())
</script>
