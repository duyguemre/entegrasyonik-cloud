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

const initial = computed(() => {
  const name = (props.storeName || '').trim()
  return name ? name[0]!.toUpperCase() : '?'
})
</script>

<style scoped>
.store-logo-avatar--monogram {
  background-color: var(--ek-color-surface-sunken);
}

.store-logo-avatar__initial {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-md);
  line-height: 1;
}
</style>
