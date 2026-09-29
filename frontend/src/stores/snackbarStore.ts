import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useSnackbarStore = defineStore('snackbarStore', () => {
  const snackbars = ref<any[]>([])
  let id = 0

  const addSnackbar = (snackbar: any) => {
    // Eğer snackbar objesi eksik gelirse patlamasın
    if (!snackbar.text) return;

    snackbar.id = id++;
    snackbar.show = true; // Her zaman true başlasın
    snackbar.timeout = snackbar.timeout || 3000;
    snackbar.color = snackbar.color || 'info';

    snackbars.value.push(snackbar);

    // Otomatik silme mekanizması (Hafıza için)
    setTimeout(() => {
      removeSnackbar(snackbar.id);
    }, snackbar.timeout + 500);
  }

  const removeSnackbar = (targetId: number) => {
    const index = snackbars.value.findIndex(s => s.id === targetId);
    if (index > -1) {
      snackbars.value.splice(index, 1); // Diziden sildiğin an Vue 'index'leri yeniden hesaplar
    }
  }
  return { snackbars, addSnackbar, removeSnackbar }
})