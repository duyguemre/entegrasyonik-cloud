<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="cat.loadedAt.value ?? undefined">
      <template #actions>
        <EkButton tone="secondary" icon="mdi-email-check-outline" data-testid="test-email" @click="testMail.open(null)">Test e-postası gönder</EkButton>
        <EkRefreshButton :loading="cat.refreshing.value" @refresh="cat.load()" />
      </template>
    </BoPageHeader>

    <div class="bo-grid-2 bo-ncat">
      <section class="bo-panel" aria-labelledby="bo-ncat-list">
        <header class="bo-panel__bar">
          <div>
            <h2 id="bo-ncat-list" class="bo-panel__title">Bildirim kodları</h2>
            <p class="bo-panel__hint">Kod tek kaynaktır (backend kataloğu); varsayılan kanal müşterinin tercihleriyle değişebilir.</p>
          </div>
        </header>
        <div class="bo-toolbar">
          <div class="bo-seg" role="radiogroup" aria-label="Yüzey">
            <button v-for="o in SURFACES" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="surface === o.value" @click="surface = o.value">{{ o.label }}</button>
          </div>
          <v-text-field v-model="search" label="Kod ya da kategori ara" density="compact" hide-details clearable prepend-inner-icon="mdi-magnify" class="bo-toolbar__field" />
        </div>
        <EkCard flush>
          <StateBlock
            :phase="catPhase"
            :error="cat.error.value"
            :empty-title="search || surface !== 'all' ? 'Aramaya uyan kod yok' : 'Katalog boş'"
            :empty-message="search || surface !== 'all' ? 'Aramayı ya da yüzey süzgecini değiştirin.' : 'Backend kataloğunda tanımlı bildirim yok.'"
            :empty-variant="search || surface !== 'all' ? 'no-results' : 'no-data'"
            @retry="cat.load()"
          >
            <div class="bo-table-wrap" tabindex="0" role="region" aria-label="Bildirim kataloğu" style="--bo-table-max-h: 70vh">
              <table class="bo-table" data-density="compact">
                <caption class="ek-sr-only">Bildirim kataloğu ({{ items.length }} kod)</caption>
                <thead>
                  <tr>
                    <th scope="col">Kod</th>
                    <th scope="col" class="bo-hide-sm">Kategori</th>
                    <th scope="col">E-posta</th>
                    <th scope="col" class="bo-hide-sm">Önem</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in items" :key="c.code" class="is-link" :class="{ 'is-selected': c.code === selected?.code }" @click="select(c)">
                    <th scope="row">
                      <button type="button" class="bo-link-btn bo-mono bo-ncat__code" :aria-pressed="c.code === selected?.code" :data-code="c.code" @click.stop="select(c)">{{ c.code }}</button>
                      <span v-if="c.mandatory" class="bo-ncat__tag">zorunlu</span>
                      <span v-if="c.surface === 'platform'" class="bo-ncat__tag">platform</span>
                    </th>
                    <td class="bo-hide-sm">{{ NOTIFY_CATEGORY[c.category] ?? c.category }}</td>
                    <td>{{ EMAIL_MODE[c.defaultChannels.email] }}</td>
                    <td class="bo-hide-sm">
                      <span class="bo-ncat__sev">
                        <EkStatusChip v-for="s in c.severities" :key="s" :tone="(NOTIFY_SEVERITY[s] ?? { tone: 'neutral' }).tone" :label="(NOTIFY_SEVERITY[s] ?? { label: s }).label" />
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </StateBlock>
        </EkCard>
      </section>

      <EkCard class="bo-ncat__preview" :title="selected ? selected.code : 'Şablon önizleme'" :subtitle="selected ? `${NOTIFY_CATEGORY[selected.category] ?? selected.category} · izin ${selected.permission} · saklama ${selected.retention}` : 'Soldan bir kod seçin'" icon="mdi-eye-outline">
        <EkEmptyState v-if="!selected" variant="first-run" title="Önizlemek için kod seçin" message="Seçtiğiniz kodun uygulama içi ve e-posta şablonu katalog örneğiyle çizilir. Gönderim yapılmaz." />
        <template v-else>
          <div class="bo-ncat__opts">
            <div class="bo-seg" role="radiogroup" aria-label="Kanal">
              <button v-for="o in CHANNELS" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="channel === o.value" :data-channel="o.value" @click="channel = o.value">{{ o.label }}</button>
            </div>
            <div class="bo-seg" role="radiogroup" aria-label="Dil">
              <button v-for="o in LOCALES" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="locale === o.value" @click="locale = o.value">{{ o.label }}</button>
            </div>
          </div>

          <fieldset class="bo-ncat__params">
            <legend>Örnek parametreler</legend>
            <template v-for="(v, k) in params" :key="k">
              <v-checkbox v-if="typeof v === 'boolean'" v-model="params[k]" :label="String(k)" density="compact" hide-details />
              <v-text-field v-else-if="typeof v === 'number'" v-model.number="params[k]" :label="String(k)" type="number" density="compact" hide-details />
              <v-text-field v-else v-model="params[k]" :label="String(k)" density="compact" hide-details maxlength="600" />
            </template>
            <p v-if="!Object.keys(params).length" class="bo-muted bo-ncat__hint">Bu kod parametre almaz.</p>
            <button type="button" class="bo-link-btn bo-ncat__reset" @click="resetParams">Katalog örneğine dön</button>
          </fieldset>

          <StateBlock v-if="!pv" :phase="pvPhase" :error="pvError" skeleton="detail" :rows="3" size="compact" @retry="render" />
          <div v-else class="bo-ncat__out" :aria-busy="pvBusy ? 'true' : 'false'" data-testid="template-preview">
            <article v-if="pv.channel === 'inApp'" class="bo-ncat__notif" aria-label="Uygulama içi bildirim örneği">
              <EkStatusChip :tone="(NOTIFY_SEVERITY[pv.severity] ?? { tone: 'neutral' }).tone" :label="(NOTIFY_SEVERITY[pv.severity] ?? { label: pv.severity }).label" dot />
              <h3>{{ pv.title }}</h3>
              <p>{{ pv.message }}</p>
              <p v-if="pv.actionPath" class="bo-muted bo-ncat__hint">Tıklayınca: <span class="bo-mono">{{ pv.actionPath }}</span></p>
            </article>
            <EmailFrame v-else :subject="pv.subject" :html="pv.html" :text="pv.text" />
          </div>
          <EkAlert v-if="pvError && pv" tone="warning" dense :title="pvError.title" :text="pvError.action" />
        </template>
      </EkCard>
    </div>

    <GuardedDialog
      :action="testMail"
      title="Test e-postası gönderilsin mi?"
      reversible
      reversible-note="Yalnız kendi adresinize tek bir [TEST] iletisi gider; müşteriye e-posta gitmez."
      description="E-posta sunucusu ayarının çalıştığını doğrular."
      icon="mdi-email-check-outline"
      :items="['Giriş yaptığınız yönetici hesabının e-posta adresine [TEST] konulu tek ileti gönderilir.', 'Adres ekranda ve denetim kaydında gösterilmez; gerekçe denetime yazılır.', 'E-posta gönderimi kapalıysa ya da sunucu hata verirse işlem yapılmaz.']"
      confirm-label="Gerekçeyle gönder"
      confirm-icon="mdi-send-outline"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { EkAlert, EkButton, EkCard, EkEmptyState, EkRefreshButton, EkStatusChip } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { NotificationCatalogItem, TemplatePreview } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import { NOTIFY_CATEGORY, NOTIFY_SEVERITY } from '@bo/utils/labels'
import { describeError, type DescribedError } from '@bo/utils/errors'
import { notifyAudited } from '@bo/utils/toast'
import EmailFrame from './EmailFrame.vue'
import '@bo/styles/kit.css'

const SURFACES = [
  { value: 'all', label: 'Tümü' },
  { value: 'tenant', label: 'Müşteri' },
  { value: 'platform', label: 'Platform' },
] as const
const CHANNELS = [
  { value: 'inApp', label: 'Uygulama içi' },
  { value: 'email', label: 'E-posta' },
] as const
const LOCALES = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
] as const
const EMAIL_MODE: Record<string, string> = { off: 'Kapalı', instant: 'Anlık', digest: 'Özet' }

const router = useRouter()
const cat = useResource<{ items: NotificationCatalogItem[] }>(() => api.call('BackofficeNotificationService/getCatalog', {}))
const surface = ref<'all' | 'tenant' | 'platform'>('all')
const search = ref('')
const items = computed(() => {
  const q = (search.value ?? '').trim().toLocaleLowerCase('tr')
  return (cat.data.value?.items ?? []).filter(
    (c) => (surface.value === 'all' || c.surface === surface.value) && (!q || c.code.toLocaleLowerCase('tr').includes(q) || (NOTIFY_CATEGORY[c.category] ?? c.category).toLocaleLowerCase('tr').includes(q)),
  )
})
const catPhase = computed(() => (cat.phase.value === 'ready' && !items.value.length ? 'empty' : cat.phase.value))

const selected = shallowRef<NotificationCatalogItem | null>(null)
const channel = ref<'inApp' | 'email'>('inApp')
const locale = ref<'tr' | 'en'>('tr')
const params = reactive<Record<string, string | number | boolean>>({})
function resetParams() {
  for (const k of Object.keys(params)) delete params[k]
  Object.assign(params, selected.value?.example ?? {})
}
function select(c: NotificationCatalogItem) {
  if (selected.value?.code === c.code) return
  selected.value = c
  resetParams()
}

const pv = shallowRef<TemplatePreview | null>(null)
const pvPhase = ref<'loading' | 'error' | 'degraded'>('loading')
const pvError = shallowRef<DescribedError | null>(null)
const pvBusy = ref(false)
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
async function render() {
  const c = selected.value
  if (!c) return
  const my = ++seq
  pvBusy.value = true
  try {
    const res = await api.call('BackofficeNotificationService/previewTemplate', { code: c.code, locale: locale.value, channel: channel.value, params: { ...params } })
    if (my !== seq) return
    pv.value = res
    pvError.value = null
  } catch (e) {
    if (my !== seq) return
    pvError.value = describeError(e)
    // Parametre hatasında son iyi önizleme kalır; ilk çizimde hata durumu gösterilir.
    if (!pv.value) pvPhase.value = pvError.value.kind === 'unavailable' ? 'degraded' : 'error'
  } finally {
    if (my === seq) pvBusy.value = false
  }
}
watch(selected, () => {
  pv.value = null
  pvPhase.value = 'loading'
})
watch([selected, channel, locale, params], () => {
  clearTimeout(timer)
  timer = setTimeout(render, 300)
})
onBeforeUnmount(() => clearTimeout(timer))

const testMail = useGuardedAction(
  (_c: null, reason) => api.call('BackofficeNotificationService/sendTestEmail', { reason }),
  () => notifyAudited('Test e-postası kendi adresinize gönderildi. Gelen kutunuzu kontrol edin.', () => router.push({ path: '/denetim', query: { event: 'backoffice.write' } })),
)

onMounted(() => cat.load())
</script>

<style scoped>
.bo-ncat {
  align-items: start;
}
.bo-ncat__preview {
  position: sticky;
  top: var(--ek-space-5);
  min-width: 0;
}
.bo-ncat__code {
  font-size: var(--ek-type-label-size);
  text-align: left;
  overflow-wrap: anywhere;
}
.bo-ncat__tag {
  display: inline-block;
  margin-left: var(--ek-space-1);
  padding: 0 var(--ek-space-1);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-regular);
}
.bo-table tbody tr.is-selected {
  background: var(--ek-color-surface-muted);
  box-shadow: inset 3px 0 0 var(--ek-color-action);
}
.bo-ncat__sev {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}
.bo-ncat__opts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-3);
}
.bo-ncat__params {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-2) var(--ek-space-3);
  margin: 0 0 var(--ek-space-4);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
}
.bo-ncat__params legend {
  padding: 0 var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}
.bo-ncat__reset {
  grid-column: 1 / -1;
  justify-self: start;
  font-size: var(--ek-type-caption-size);
}
.bo-ncat__hint {
  margin: 0;
  font-size: var(--ek-type-caption-size);
}
.bo-ncat__out {
  transition: opacity var(--ek-duration-fast) var(--ek-easing-standard);
}
.bo-ncat__out[aria-busy='true'] {
  opacity: 0.6;
}
.bo-ncat__notif {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-2);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-raised);
}
.bo-ncat__notif h3 {
  margin: 0;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-ncat__notif p {
  margin: 0;
}
@media (max-width: 959px) {
  .bo-ncat__preview {
    position: static;
  }
}
@media (max-width: 599px) {
  .bo-ncat__params {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .bo-ncat__out {
    transition: none;
  }
}
</style>
