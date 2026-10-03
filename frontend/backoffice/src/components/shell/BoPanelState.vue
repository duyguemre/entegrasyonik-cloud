<!--
  BoPanelState — bir veri bölümünün (kart, tablo, pano bölümü) YÜKLENİYOR / HATA / BOŞ / KISMİ BOZULMA durumları için
  tek bileşen (BO_UI_PATTERNS §4). Hazır durumda hiçbir şey çizmez; bölüm kendi içeriğini `v-else` ile gösterir.

    <BoPanelState v-if="state !== 'ready'" :state="state" skeleton="table" :error="err" empty-title="Kayıt yok" @retry="load" />

  - loading  → iskelet (yerleşim kaymaz; `skeleton` türü ve `rows` içerikle aynı biçim)
  - error    → "<ne oldu> — <ne yapılmalı>" + Tekrar dene + istek kimliği (kopyalanabilir). Ham hata metni yok.
  - degraded → bölüm okunamadı (zaman aşımı/servis hatası), diğer bölümler güncel: sarı ton, Tekrar dene.
  - empty    → sakin boş durum (neden boş + ne yapılabilir).
  bo-wdg: hata/bozulma kalıcı canlı kabın içinde çizilir → yüklemeden SONRA çıkan sorun bir kez duyurulur (metin
  kopyalanmaz; EkProblemState kendi bölgesinde yalnız yeniden deneme sonucunu söyler → çift duyuru yok).
-->
<template>
  <div class="bo-state" :class="`is-${state}`" :aria-busy="state === 'loading' || undefined">
    <EkSkeleton v-if="state === 'loading'" :type="skeleton" :rows="rows" />
    <div class="bo-state__live" aria-live="polite" data-testid="state-live">
      <EkProblemState
        v-if="state === 'error'"
        size="compact"
        tone="error"
        :title="errorTitle"
        :action="errorAction"
        :details="details"
        :retrying="retrying"
        @retry="$emit('retry')"
      />
      <EkProblemState
        v-else-if="state === 'degraded'"
        size="compact"
        tone="warning"
        icon="mdi-lan-disconnect"
        :title="degradedTitle"
        :cause="degradedCause"
        action="Diğer bölümler güncel. Birkaç saniye sonra yeniden deneyin; sürerse Loglar ve sorunlar ekranına bakın."
        :retrying="retrying"
        @retry="$emit('retry')"
      />
    </div>
    <div v-if="state === 'empty'" class="bo-state__empty">
      <v-icon :icon="emptyIcon" aria-hidden="true" />
      <p class="bo-state__empty-title">{{ emptyTitle }}</p>
      <p v-if="emptyText" class="bo-state__empty-text">{{ emptyText }}</p>
      <slot name="empty-action" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkProblemState, EkSkeleton } from '@entegrasyonik/ui/components'
import { AdminApiError } from '@bo/api/client'

export type PanelState = 'loading' | 'ready' | 'empty' | 'error' | 'degraded'

const props = withDefaults(
  defineProps<{
    state: PanelState
    skeleton?: 'table' | 'cards' | 'form' | 'detail'
    rows?: number
    error?: unknown
    /** Hata başlığı; verilmezse API hatasının kullanıcı metni. */
    errorText?: string
    degradedTitle?: string
    /** "timeout" | "error" (getHealth bölüm hatası) ya da serbest metin. */
    degradedReason?: string
    emptyTitle?: string
    emptyText?: string
    emptyIcon?: string
    retrying?: boolean
  }>(),
  {
    skeleton: 'detail',
    rows: 4,
    degradedTitle: 'Bu bölüm şu an okunamıyor',
    emptyTitle: 'Gösterilecek kayıt yok',
    emptyIcon: 'mdi-tray-remove',
    retrying: false,
  },
)
defineEmits<{ retry: [] }>()

const apiError = computed(() => (props.error instanceof AdminApiError ? props.error : null))
const errorTitle = computed(() => props.errorText ?? apiError.value?.message ?? 'Veriler yüklenemedi')
const errorAction = computed(() =>
  apiError.value?.code === 'NETWORK' ? 'Bağlantınızı kontrol edip yeniden deneyin.' : 'Yeniden deneyin; sorun sürerse istek kimliğiyle Loglar ekranında arayın.',
)
const details = computed(() => (apiError.value?.requestId ? [{ label: 'İstek kimliği', value: apiError.value.requestId }] : undefined))
const degradedCause = computed(() =>
  props.degradedReason === 'timeout' ? 'Kaynak 2 saniye içinde yanıt vermedi (zaman aşımı).' : props.degradedReason === 'error' ? 'Kaynak hata döndürdü.' : props.degradedReason,
)
</script>

<style scoped>
.bo-state__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-1);
  padding: var(--ek-space-8) var(--ek-space-4);
  text-align: center;
}

.bo-state__empty .v-icon {
  margin-bottom: var(--ek-space-2);
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-2xl);
}

.bo-state__empty-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-state__empty-text {
  max-width: 52ch;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

/* BO-LOCAL-01 — boş durum: ikon çerçeveli köşeli kutuda (yuvarlak / çıplak büyük ikon yok). */
.bo-state__empty .v-icon {
  width: 44px;
  height: 44px;
  margin-bottom: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
}
</style>
