<template>
  <v-avatar :size="size" class="store-logo-avatar" :class="{ 'store-logo-avatar--monogram': !logo }">
    <v-img v-if="logo" :src="logo" :alt="storeName ? `${storeName} logosu` : 'Mağaza logosu'" cover />
    <span v-else class="store-logo-avatar__initial" :aria-label="storeName ? `${storeName} logosu` : 'Mağaza logosu'"
      role="img">{{ initial }}</span>
  </v-avatar>
</template>

<script setup lang="ts">
/**
 * Tenant (mağaza) logosu — gerçek logo varsa gösterir, yoksa nötr bir monogram (ADR-0015 kararı).
 *
 * NEDEN (docs/FRONTEND_CODE_AUDIT.md H-01): eskiden `stores/context.ts` içine gerçek bir müşterinin
 * ("DALZİ AYAKKABI…") adı/logosu SABİT KODLANMIŞTI ve TÜM kiracılara gösteriliyordu (çok kiracılı
 * SaaS'ta ticari/KVKK sızıntısı). Artık logo `userApi.getStoreLogo()` (gerçek tenant ayarı,
 * `SettingService/getSettings`) üzerinden gelir; boşsa asla soluk/boş bir kutu ya da başka bir
 * kiracının görseli DEĞİL, mağaza adının baş harfinden oluşan nötr bir rozet gösterilir.
 */
import { computed } from 'vue'

const props = defineProps<{ storeName?: string; logo?: string; size?: number | string }>()

// FE-R4 A2: monogram üst bardaki hesap avatarıyla aynı (ilk iki kelimenin baş harfi, tr-TR büyük harf).
const initial = computed(() => {
  const name = (props.storeName || '').trim()
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toLocaleUpperCase('tr-TR')
})
</script>

<style scoped>
/* FR2-DARK: gerçek logo (çoğu şeffaf) iki temada da okunur bir plaka üzerinde. */
.store-logo-avatar:not(.store-logo-avatar--monogram) {
  background-color: var(--ek-app-media-plate);
}

.store-logo-avatar--monogram {
  background-color: var(--ek-color-action-subtle);
  box-shadow: inset 0 0 0 1px var(--ek-color-action-border);
}

.store-logo-avatar__initial {
  font-weight: var(--ek-font-weight-bold);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  line-height: 1;
}
</style>
