<template>
  <div class="AppView">
    <!-- ADR-0015 Karar 6.1 + Aşama 6b (Standart 1) — TEK toast konteyneri. Eski `snackbarStore.addSnackbar`
         çağrıları da `useToast()`'a yönlenir (ayrı snackbar görünümü kaldırıldı). Uygulama geneli: sekme dışında. -->
    <EkToastHost />
    <!-- Faz 3 / C2a — adım-yükseltme (401 REAUTH_REQUIRED) parola diyaloğu: uygulama genelinde TEK örnek, sekme dışında. -->
    <ReauthDialog />
    <router-view v-if="isReady" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import useUser from './composables/user';
import { EkToastHost } from '@entegrasyonik/ui/components';
import ReauthDialog from './components/user/ReauthDialog.vue';


const userApi = useUser();
const isReady = ref(false);

onMounted(async () => {
  try {
    // Uygulama ayağa kalkarken bir kez kimlik bilgilerini tazele
    await userApi.fetchUserContext();
  } catch (e) {
    console.error("Context yükleme hatası");
  } finally {
    isReady.value = true; // Ne olursa olsun burayı açmalısın
  }
});
</script>