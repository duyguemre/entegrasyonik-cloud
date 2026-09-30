<template>
  <div class="AppView">
    <!-- ADR-0015 Karar 6.1 + Aşama 6b (Standart 1) — TEK toast konteyneri. Eski `snackbarStore.addSnackbar`
         çağrıları da `useToast()`'a yönlenir (ayrı snackbar görünümü kaldırıldı). Uygulama geneli: sekme dışında. -->
    <EkToastHost />
    <router-view v-if="isReady" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import useUser from './composables/user';
import EkToastHost from './components/ds/EkToastHost.vue';


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