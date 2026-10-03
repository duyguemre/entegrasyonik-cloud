<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="cat.loadedAt.value ?? undefined" :stale="cat.stale.value" refreshable :refreshing="cat.refreshing.value" @refresh="cat.load()">
      <template #actions>
        <BoAction kind="send" label="Test e-postası gönder" data-testid="test-email" @click="testMail.open('self')" />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <BoTileGrid :cols="2" class="bo-ncat">
      <BoSection id="bo-ncat-list" title="Bildirim kodları" description="Kod tek kaynaktır (backend kataloğu); varsayılan kanal müşterinin tercihleriyle değişebilir." icon="mdi-format-list-bulleted" fill>
        <BoFilterBar label="Katalog süzgeçleri" :active="activeFilters" @clear="clearFilters">
          <template #search>
            <v-text-field v-model="search" label="Kod ya da kategori ara" density="compact" hide-details clearable prepend-inner-icon="mdi-magnify" class="bo-toolbar__field" />
          </template>
          <BoSegmented v-model="surface" label="Yüzey" :options="SURFACES" />
        </BoFilterBar>
        <StateBlock
          :phase="catPhase"
          :error="cat.error.value"
          :empty-title="search || surface !== 'all' ? 'Aramaya uyan kod yok' : 'Katalog boş'"
          :empty-message="search || surface !== 'all' ? 'Aramayı ya da yüzey süzgecini değiştirin.' : 'Backend kataloğunda tanımlı bildirim yok.'"
          :empty-variant="search || surface !== 'all' ? 'no-results' : 'no-data'"
          @retry="cat.load()"
        >
          <BoTableFrame :label="`Bildirim kataloğu (${items.length} kod)`" max-height="70vh">
            <template #head>
              <tr>
                <th scope="col">Kod</th>
                <th scope="col" class="bo-hide-sm">Kategori</th>
                <th scope="col">E-posta</th>
                <th scope="col" class="bo-hide-sm">Önem</th>
              </tr>
            </template>
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
          </BoTableFrame>
        </StateBlock>
      </BoSection>

      <BoSection
        class="bo-ncat__preview"
        :title="selected ? selected.code : 'Şablon önizleme'"
        :description="selected ? `${NOTIFY_CATEGORY[selected.category] ?? selected.category} · izin ${selected.permission} · saklama ${selected.retention}` : 'Soldan bir kod seçin'"
        icon="mdi-eye-outline"
        fill
      >
        <EkEmptyState v-if="!selected" variant="first-run" title="Önizlemek için kod seçin" message="Seçtiğiniz kodun uygulama içi ve e-posta şablonu katalog örneğiyle çizilir. Gönderim yapılmaz." />
        <template v-else>
          <div class="bo-ncat__opts">
            <BoSegmented v-model="channel" label="Kanal" :options="CHANNELS" />
            <BoSegmented v-model="locale" label="Dil" :options="LOCALES" />
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
      </BoSection>
    </BoTileGrid>

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
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkEmptyState, EkStatusChip } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { NotificationCatalogItem, TemplatePreview } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoFilterBar from '@bo/components/r2/BoFilterBar.vue'
import BoSegmented, { type BoSegmentOption } from '@bo/components/r2/BoSegmented.vue'
import BoTableFrame from '@bo/components/r2/BoTableFrame.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { catalogVerdict } from './notificationsVerdict'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import { NOTIFY_CATEGORY, NOTIFY_SEVERITY } from '@bo/utils/labels'
import { describeError, type DescribedError } from '@bo/utils/errors'
import { notifyAudited } from '@bo/utils/toast'
import EmailFrame from './EmailFrame.vue'
import '@bo/styles/kit.css'

const SURFACES: Array<BoSegmentOption<'all' | 'tenant' | 'platform'>> = [
  { value: 'all', label: 'Tümü' },
  { value: 'tenant', label: 'Müşteri' },
  { value: 'platform', label: 'Platform' },
]
const CHANNELS: Array<BoSegmentOption<'inApp' | 'email'>> = [
  { value: 'inApp', label: 'Uygulama içi' },
  { value: 'email', label: 'E-posta' },
]
const LOCALES: Array<BoSegmentOption<'tr' | 'en'>> = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
]
const EMAIL_MODE: Record<string, string> = { off: 'Kapalı', instant: 'Anlık', digest: 'Özet' }

const router = useRouter()
const cat = useResource<{ items: NotificationCatalogItem[] }>(() => api.call('BackofficeNotificationService/getCatalog', {}))
const surface = ref<'all' | 'tenant' | 'platform'>('all')
const route = useRoute()
// Hüküm bağlantısı `?ara=<kod>` ile açar.
const search = ref(typeof route.query.ara === 'string' ? route.query.ara : '')
watch(
  () => route.query.ara,
  (v) => {
    search.value = typeof v === 'string' ? v : ''
  },
)
const items = computed(() => {
  const q = (search.value ?? '').trim().toLocaleLowerCase('tr')
  return (cat.data.value?.items ?? []).filter(
    (c) => (surface.value === 'all' || c.surface === surface.value) && (!q || c.code.toLocaleLowerCase('tr').includes(q) || (NOTIFY_CATEGORY[c.category] ?? c.category).toLocaleLowerCase('tr').includes(q)),
  )
})
const activeFilters = computed(() => (search.value?.trim() ? 1 : 0) + (surface.value !== 'all' ? 1 : 0))
function clearFilters() {
  search.value = ''
  surface.value = 'all'
}
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
  (_c: 'self', reason) => api.call('BackofficeNotificationService/sendTestEmail', { reason }),
  () => notifyAudited('Test e-postası kendi adresinize gönderildi. Gelen kutunuzu kontrol edin.', () => router.push({ path: '/denetim', query: { event: 'backoffice.write' } })),
)

/** Son test e-postası "gönderim kapalı" (503 NOTIFY_EMAIL_UNAVAILABLE) ile reddedildiyse hüküm uyarır; başarıda temizlenir. */
const emailUnavailable = computed(() => testMail.error.value?.code === 'NOTIFY_EMAIL_UNAVAILABLE' || (testMail.error.value?.status === 503 && !testMail.isOpen.value))
const verdict = computed(() =>
  cat.data.value || cat.phase.value !== 'loading'
    ? catalogVerdict({
        items: cat.data.value?.items ?? null,
        failed: !cat.data.value,
        stale: cat.stale.value,
        emailUnavailable: emailUnavailable.value,
        retry: () => cat.load(),
        testMail: () => testMail.open('self'),
      })
    : null,
)

onMounted(() => cat.load())
</script>

<style scoped>
.bo-ncat__preview {
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
  min-width: 0;
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
.bo-ncat__notif > * {
  /* Parametreli önizleme (uzun URL / kimlik) dar ekranda kırılır, taşmaz. */
  max-width: 100%;
  overflow-wrap: anywhere;
}
.bo-ncat__notif h3 {
  margin: 0;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-ncat__notif p {
  margin: 0;
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

/* ================= BO-LOCAL-01 — olay kataloğu: uygulamanın tasarım diliyle =================
   Seçili satır: sol şerit YOK — eylem renginin düz açık zemini. Etiketler köşeli; örnek parametre kutusu kutu köşeli,
   başlığı kısa eylem çizgili mikro etiket; bildirim örneği düz yüzeyde ince çerçeveli kart. */
.bo-table tbody tr.is-selected,
.bo-table tbody tr.is-selected > * {
  background: var(--ek-color-action-subtle);
  box-shadow: none;
}

.bo-ncat__tag {
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
}

.bo-ncat__params {
  border-color: var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
}

.bo-ncat__params legend {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: 0 var(--ek-space-2);
}

.bo-ncat__params legend::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.bo-ncat__notif {
  border-color: var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
}

.bo-ncat__notif h3 {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
}

.bo-ncat__notif p {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-body-line);
}
</style>
