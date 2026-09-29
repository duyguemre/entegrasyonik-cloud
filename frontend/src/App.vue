<template>
  <div class="AppView">
    <SnackbarComponent />
    <!-- ADR-0015 Karar 6.1 — TEK toast konteyneri (A2'de kuruldu, A3'te kök layout'a bağlandı).
         `SnackbarComponent`/`snackbarStore` bugünkü ÜRETİM bildirim mekanizması olarak KALIR
         (40+ çağrı noktası; A3 kapsamı DEĞİL — kademeli göç BACKLOG'da). `useToast()`'u henüz
         HİÇBİR ekran ÇAĞIRMIYOR, bu yüzden ikisi ÇAKIŞMAZ (aynı anda ikisi de göstermez); yeni/
         göç eden ekranlar `useToast()`'a geçtikçe bu host devreye girer. -->
    <EkToastHost />
    <router-view v-if="isReady" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import useUser from './composables/user';
import SnackbarComponent from './components/SnackbarComponent.vue';
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