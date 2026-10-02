<template>
  <BoSection id="bo-env" flush class="bo-flushed" title="Ortam (salt okunur)" description="Bu değerler sunucu ortam değişkenlerinden gelir; burada düzenlenemez ve hiçbir kaydetme isteğine girmez. Sır, CORS ve bağlantı dizesi gösterilmez.">
    <template #actions><EkRefreshButton quiet-success :loading="env.refreshing.value" @refresh="env.load()" /></template>
      <StateBlock :phase="env.phase.value" :error="env.error.value" skeleton="form" :rows="3" error-title="Ortam bilgisi okunamadı" @retry="env.load()">
        <dl class="bo-env">
          <div v-for="r in rows" :key="r.label" class="bo-env__row" :data-env="r.key">
            <dt>{{ r.label }}</dt>
            <dd>
              <span class="bo-env__value" :class="{ 'bo-mono': r.mono }">{{ r.value }}</span>
              <span class="bo-env__lock"><v-icon icon="mdi-lock-outline" size="14" aria-hidden="true" /> env'den gelir, değiştirmek için yeniden dağıtım gerekir</span>
            </dd>
          </div>
        </dl>
    </StateBlock>
  </BoSection>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import { EkRefreshButton } from '@entegrasyonik/ui/components'
import { ADMIN_API_BASE, USE_MOCK } from '@bo/api'
import { AdminApiError, apiOriginOf } from '@bo/api/client'
import type { PublicConfig } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { formatBytes } from '@bo/utils/units'
import '@bo/styles/kit.css'

/** Ortam bilgisi YALNIZ kimliksiz `GET /api/public-config`ten okunur (istemcide yöntem yok; api nesnesine dokunulmaz). */
async function readPublicConfig(): Promise<PublicConfig> {
  if (USE_MOCK) {
    const mock = (window as unknown as { __boMock?: { handle(m: string, p: string, b: unknown): { data: PublicConfig } } }).__boMock
    if (!mock) throw new Error('mock')
    return mock.handle('GET', '/api/public-config', {}).data
  }
  const r = await fetch(`${apiOriginOf(ADMIN_API_BASE)}/api/public-config`, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(String(r.status))
  return (await r.json()) as PublicConfig
}

const env = useResource<PublicConfig>(async () => {
  try {
    return await readPublicConfig()
  } catch {
    throw new AdminApiError(0, { error: 'Ortam bilgisi okunamadı', code: 'ENV_UNREADABLE' })
  }
})

const rows = computed(() => {
  const d = env.data.value
  return [
    { key: 'app-env', label: 'Ortam', value: import.meta.env.VITE_ADMIN_ENV || 'local', mono: false },
    { key: 'image-base', label: 'Ürün görseli tabanı (images.productBaseUrl)', value: d?.env.images.productBaseUrl || '—', mono: true },
    { key: 'upload-max', label: 'Görsel yükleme üst sınırı (images.uploadMaxBytes)', value: d ? formatBytes(d.env.images.uploadMaxBytes) : '—', mono: false },
  ]
})

onMounted(() => env.load())
</script>

<style scoped>
.bo-flushed :deep(.bo-section__body) {
  padding-top: var(--ek-space-3);
}
.bo-env {
  display: flex;
  flex-direction: column;
  margin: 0;
}
.bo-env__row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(0, 2fr);
  gap: var(--ek-space-2) var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}
.bo-env__row:last-child {
  border-bottom: 0;
}
.bo-env dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}
.bo-env dd {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  min-width: 0;
}
.bo-env__value {
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}
.bo-env__lock {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
@media (max-width: 640px) {
  .bo-env__row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
