<!--
  frontend/src/components/login/GoogleSignInButton.vue

  GL-FE2 — "Google ile devam et / kaydol" düğmesi (kendi düğmemiz). Google'ın resmi iframe düğmesi kişiselleşip e-posta
  adresi gösteriyor ve biçimlendirilemiyordu; bu düğme tasarım dilindeki ikincil düğmedir (düz, 1px çerçeve, gölgesiz)
  ve solda Google'ın resmi çok renkli "G" logosunu taşır. Tıklama Google'ın hesap seçme penceresini açar
  (`useGoogleSignIn().start`, yetkilendirme kodu akışı). Mantık: `src/composables/googleSignIn.ts`.
-->
<template>
  <button type="button" class="ek-google-btn" :class="{ 'is-pending': pending }" :disabled="pending" :aria-busy="pending ? 'true' : undefined"
    data-testid="google-signin" @click="$emit('start')">
    <span class="ek-google-btn__mark" aria-hidden="true">
      <v-progress-circular v-if="pending" indeterminate size="16" width="2" class="ek-google-btn__spinner" />
      <GoogleLogo v-else />
    </span>
    <span class="ek-google-btn__label">{{ pending ? "Google'a bağlanılıyor…" : label }}</span>
  </button>
</template>

<script setup lang="ts">
import GoogleLogo from './GoogleLogo.vue'

defineProps<{ label: string; pending?: boolean }>()
defineEmits<{ start: [] }>()
</script>

<style scoped>
/* İkincil düğme: "Devam et" ile aynı yükseklik ve köşe; gölge yok. Üzerine gelince eylem tonu zemin + çerçeve. */
.ek-google-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-3);
  width: 100%;
  height: var(--ek-login-control-h, 52px);
  padding: 0 var(--ek-space-4);
  border: 1px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font: inherit;
  font-size: 0.9375rem;
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: background-color var(--ek-motion-feedback), border-color var(--ek-motion-feedback);
}

.ek-google-btn:hover:not(:disabled) {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.ek-google-btn:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

.ek-google-btn:disabled {
  cursor: progress;
}

.ek-google-btn.is-pending {
  color: var(--ek-color-content-default);
}

.ek-google-btn__mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
}

.ek-google-btn__spinner {
  color: var(--ek-color-action);
}

.ek-google-btn__label {
  white-space: nowrap;
}
</style>
