<template>
  <div class="bo-page">
    <BoPageHeader :title="isEdit ? 'Duyuruyu düzenle' : 'Yeni duyuru'" lede="" :extra-crumbs="[{ label: isEdit ? 'Düzenle' : 'Yeni duyuru' }]">
      <template #meta>
        <span>Kaydedilen duyuru <strong>taslak</strong> olur; müşteriler ancak zamanladığınızda görür.</span>
      </template>
      <template #actions>
        <EkButton tone="secondary" icon="mdi-close" @click="router.push(isEdit ? `/sistem/duyurular/${id}` : '/sistem/duyurular')">Vazgeç</EkButton>
        <EkButton tone="primary" icon="mdi-content-save-outline" :disabled="!!blocking || !ready" data-testid="save" @click="save.open(null)">Taslağı kaydet</EkButton>
      </template>
    </BoPageHeader>

    <EkEmptyState v-if="loadState === 'notFound'" variant="no-results" title="Duyuru bulunamadı" message="Duyuru silinmiş ya da bağlantı hatalı olabilir; listeye dönün." />
    <EkEmptyState
      v-else-if="loadState === 'locked'"
      variant="no-data"
      title="Yalnız taslak duyuru düzenlenebilir"
      message="Bu duyuru zamanlanmış, yayında ya da sona ermiş. Değişiklik için iptal edip yeni duyuru oluşturun."
    />
    <StateBlock v-else-if="loadState !== 'ready'" :phase="loadState" :error="loadError" skeleton="form" :rows="6" @retry="loadExisting" />

    <div v-else class="bo-grid-2 bo-anne">
      <form class="bo-anne__form" novalidate aria-label="Duyuru formu" @submit.prevent="!blocking && save.open(null)">
        <EkCard title="Tür ve önem" icon="mdi-shape-outline">
          <div class="bo-anne__kinds" role="radiogroup" aria-label="Duyuru türü">
            <button
              v-for="k in KINDS"
              :key="k"
              type="button"
              role="radio"
              class="bo-anne__kind"
              :aria-checked="form.kind === k"
              :data-kind="k"
              @click="setKind(k)"
            >
              <v-icon :icon="ANN_KIND[k].icon" aria-hidden="true" />
              <span class="bo-anne__kind-label">{{ ANN_KIND[k].label }}</span>
              <span class="bo-anne__kind-hint">{{ ANN_KIND[k].hint }}</span>
            </button>
          </div>
          <div class="bo-anne__row">
            <v-select v-model="severityChoice" :items="severityItems" label="Önem" density="compact" hide-details class="bo-anne__half" data-testid="severity" />
            <v-checkbox
              v-model="form.dismissible"
              :disabled="undismissable"
              density="compact"
              hide-details
              :label="undismissable ? 'Kapatılamaz (bakım / olay)' : 'Kullanıcı bandı kapatabilir'"
            />
          </div>
        </EkCard>

        <EkCard title="Metin" subtitle="Düz metin; bağlantı ve biçim yorumlanmaz." icon="mdi-text-box-edit-outline">
          <v-text-field v-model="form.titleTr" label="Başlık (Türkçe)" density="compact" counter="160" maxlength="160" :error-messages="touched && !form.titleTr.trim() ? 'Başlık zorunlu.' : undefined" data-testid="title-tr" />
          <v-textarea v-model="form.bodyTr" label="Metin (Türkçe)" density="compact" rows="4" auto-grow counter="2000" maxlength="2000" :error-messages="touched && !form.bodyTr.trim() ? 'Metin zorunlu.' : undefined" data-testid="body-tr" />
          <button type="button" class="bo-link-btn bo-anne__toggle" :aria-expanded="showEn" aria-controls="bo-anne-en" data-testid="toggle-en" @click="showEn = !showEn">
            <v-icon :icon="showEn ? 'mdi-chevron-up' : 'mdi-chevron-down'" aria-hidden="true" />İngilizce metin (isteğe bağlı)
          </button>
          <EkCollapse id="bo-anne-en" :open="showEn">
            <v-text-field v-model="form.titleEn" label="Title (English)" density="compact" counter="160" maxlength="160" />
            <v-textarea v-model="form.bodyEn" label="Body (English)" density="compact" rows="3" auto-grow counter="2000" maxlength="2000" />
            <p class="bo-muted bo-anne__hint">Boş bırakılırsa İngilizce kullanan üyeler Türkçe metni görür.</p>
          </EkCollapse>
        </EkCard>

        <EkCard title="Hedef" icon="mdi-target">
          <div class="bo-seg" role="radiogroup" aria-label="Hedef">
            <button v-for="o in TARGETS" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="form.targetMode === o.value" :data-target="o.value" @click="form.targetMode = o.value">{{ o.label }}</button>
          </div>
          <p v-if="form.targetMode === 'all'" class="bo-muted bo-anne__hint">Tüm aktif müşteriler (deneme, aktif ve ödemesi gecikmiş abonelikler).</p>
          <fieldset v-else-if="form.targetMode === 'plans'" class="bo-anne__plans">
            <legend class="ek-sr-only">Planlar</legend>
            <v-checkbox v-for="p in PLANS" :key="p" v-model="form.planCodes" :value="p" :label="planLabel(p)" density="compact" hide-details />
            <p v-if="touched && !form.planCodes.length" class="bo-anne__err" role="alert">En az bir plan seçin.</p>
          </fieldset>
          <template v-else>
            <v-textarea
              v-model="form.tidsText"
              label="Müşteri numaraları"
              placeholder="101, 102, 107"
              density="compact"
              rows="2"
              auto-grow
              :hint="`${parsed.tids.length} müşteri · virgül, boşluk ya da satırla ayırın (en çok 5.000)`"
              persistent-hint
              :error-messages="tidError"
              data-testid="tids"
            />
          </template>
          <div class="bo-seg bo-anne__aud" role="radiogroup" aria-label="Kitle">
            <button v-for="o in AUDIENCES" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="form.audience === o.value" @click="form.audience = o.value">{{ o.label }}</button>
          </div>
        </EkCard>

        <EkCard title="Kanallar ve zaman" icon="mdi-broadcast">
          <div class="bo-anne__channels">
            <v-checkbox v-model="form.banner" density="compact" hide-details label="Bant (uygulamanın üstünde)" data-testid="ch-banner" />
            <v-checkbox v-model="form.inApp" :disabled="form.email" density="compact" hide-details label="Uygulama içi bildirim" data-testid="ch-inapp" />
            <v-checkbox v-model="form.email" density="compact" hide-details label="E-posta (toplu)" data-testid="ch-email" />
          </div>
          <p v-if="form.email" class="bo-muted bo-anne__hint">E-posta seçildiğinde uygulama içi bildirim de gönderilir. Zamanlarken "yalnız hizmet duyurusu" onayı istenir.</p>
          <p v-if="touched && !form.banner && !form.inApp && !form.email" class="bo-anne__err" role="alert">En az bir kanal seçin.</p>
          <div class="bo-anne__row">
            <v-text-field v-model="form.startsAt" type="datetime-local" label="Başlangıç" density="compact" class="bo-anne__half" :error-messages="touched && !startsIso ? 'Başlangıç zamanı zorunlu.' : undefined" data-testid="starts-at" />
            <v-text-field v-model="form.endsAt" type="datetime-local" label="Bitiş (isteğe bağlı)" density="compact" class="bo-anne__half" :error-messages="endError" data-testid="ends-at" />
          </div>
          <p class="bo-muted bo-anne__hint">
            Saatler tarayıcınızın saat diliminde. Geçmiş bir başlangıç zamanlandığında hemen yayına girer.
            <button type="button" class="bo-link-btn" @click="startNow">Şimdiye ayarla</button>
          </p>
        </EkCard>
      </form>

      <EkCard class="bo-anne__preview">
        <AnnouncementPreview :preview="preview" :channels="{ banner: form.banner, inApp: form.inApp, email: form.email }" :phase="previewPhase" :error="previewError" :refreshing="previewBusy" @retry="refreshPreview" />
        <p v-if="blocking" class="bo-muted bo-anne__hint" data-testid="preview-blocked">{{ blocking }}</p>
      </EkCard>
    </div>

    <GuardedDialog
      :action="save"
      :title="isEdit ? 'Taslak güncellensin mi?' : 'Taslak oluşturulsun mu?'"
      :description="form.titleTr"
      icon="mdi-content-save-outline"
      :items="[
        'Duyuru taslak olarak kaydedilir; müşteriler henüz görmez.',
        `Hedef: ${draft ? targetText(draft.target) : '—'} · kanallar: ${draft ? channelsText(draft.channels) : '—'}.`,
        'Yayına almak için detay sayfasından zamanlayın. Gerekçe denetim kaydına yazılır.',
      ]"
      :confirm-label="isEdit ? 'Gerekçeyle güncelle' : 'Gerekçeyle kaydet'"
      confirm-icon="mdi-content-save-outline"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkButton, EkCard, EkCollapse, EkEmptyState } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { AnnouncementAudience, AnnouncementInput, AnnouncementKind, AnnouncementPreview as Preview, AnnouncementSeverity } from '@bo/api/contract'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import { ANN_KIND, ANN_SEVERITY, planLabel } from '@bo/utils/labels'
import { describeError, type DescribedError } from '@bo/utils/errors'
import { notifyAudited } from '@bo/utils/toast'
import AnnouncementPreview from './AnnouncementPreview.vue'
import { channelsText, fromLocalInput, parseTids, targetText, toInput, toLocalInput } from './announcementText'
import '@bo/styles/kit.css'

const KINDS: AnnouncementKind[] = ['info', 'release', 'maintenance', 'incident']
/** SÖZLEŞME EKSİĞİ (abonelik ekranıyla aynı): admin plan listesi ucu yok; sunucu plan kodunu doğrular. */
const PLANS = ['starter', 'growth', 'enterprise']
const TARGETS = [
  { value: 'all', label: 'Tüm müşteriler' },
  { value: 'plans', label: 'Plana göre' },
  { value: 'tenants', label: 'Seçili müşteriler' },
] as const
const AUDIENCES: Array<{ value: AnnouncementAudience; label: string }> = [
  { value: 'all_members', label: 'Tüm üyeler' },
  { value: 'owners_admins', label: 'Yalnız sahip ve yöneticiler' },
]
const DEFAULT_SEVERITY: Record<AnnouncementKind, AnnouncementSeverity> = { info: 'info', release: 'info', maintenance: 'warning', incident: 'critical' }

const route = useRoute()
const router = useRouter()
const id = route.params.id ? String(route.params.id) : null
const isEdit = !!id

function nextHour() {
  const d = new Date(Date.now() + 60 * 60_000)
  d.setMinutes(0, 0, 0)
  return d.toISOString()
}

const form = reactive({
  kind: 'info' as AnnouncementKind,
  severity: null as AnnouncementSeverity | null,
  titleTr: '',
  bodyTr: '',
  titleEn: '',
  bodyEn: '',
  targetMode: 'all' as 'all' | 'plans' | 'tenants',
  planCodes: [] as string[],
  tidsText: '',
  audience: 'all_members' as AnnouncementAudience,
  banner: true,
  inApp: true,
  email: false,
  startsAt: toLocalInput(nextHour()),
  endsAt: '',
  dismissible: true,
})
const showEn = ref(false)
const touched = ref(false)

const undismissable = computed(() => form.kind === 'maintenance' || form.kind === 'incident')
function setKind(k: AnnouncementKind) {
  form.kind = k
  if (k === 'maintenance' || k === 'incident') form.dismissible = false
  else if (!isEdit) form.dismissible = true
}
const severityItems = computed(() => [
  { title: `Türe göre (${ANN_SEVERITY[DEFAULT_SEVERITY[form.kind]].label})`, value: 'auto' },
  ...(['info', 'warning', 'critical'] as AnnouncementSeverity[]).map((s) => ({ title: ANN_SEVERITY[s].label, value: s })),
])
const severityChoice = computed({
  get: () => form.severity ?? 'auto',
  set: (v: string) => (form.severity = v === 'auto' ? null : (v as AnnouncementSeverity)),
})
watch(
  () => form.email,
  (on) => {
    if (on) form.inApp = true
  },
)

const parsed = computed(() => parseTids(form.tidsText))
const tidError = computed(() => {
  if (parsed.value.invalid.length) return `Geçersiz: ${parsed.value.invalid.slice(0, 5).join(', ')}`
  if (parsed.value.tids.length > 5000) return 'En çok 5.000 müşteri seçilebilir.'
  if (touched.value && !parsed.value.tids.length) return 'En az bir müşteri numarası girin.'
  return undefined
})
const startsIso = computed(() => fromLocalInput(form.startsAt))
const endsIso = computed(() => fromLocalInput(form.endsAt))
const endError = computed(() => (endsIso.value && startsIso.value && Date.parse(endsIso.value) <= Date.parse(startsIso.value) ? 'Bitiş başlangıçtan sonra olmalı.' : undefined))
function startNow() {
  form.startsAt = toLocalInput(new Date().toISOString())
}

/** Sunucuya gidecek girdi (strict: yalnız sözleşme alanları). Geçersizse null + neden. */
const draft = computed<AnnouncementInput | null>(() => {
  if (!form.titleTr.trim() || !form.bodyTr.trim() || !startsIso.value || endError.value) return null
  if (!form.banner && !form.inApp && !form.email) return null
  let target: AnnouncementInput['target']
  if (form.targetMode === 'all') target = { mode: 'all' }
  else if (form.targetMode === 'plans') {
    if (!form.planCodes.length) return null
    target = { mode: 'plans', planCodes: [...form.planCodes] }
  } else {
    if (!parsed.value.tids.length || parsed.value.invalid.length || parsed.value.tids.length > 5000) return null
    target = { mode: 'tenants', tids: parsed.value.tids }
  }
  const en = (s: string) => (s.trim() ? s.trim() : undefined)
  const titleEn = en(form.titleEn)
  const bodyEn = en(form.bodyEn)
  return {
    kind: form.kind,
    ...(form.severity ? { severity: form.severity } : {}),
    title: { tr: form.titleTr.trim(), ...(titleEn ? { en: titleEn } : {}) },
    body: { tr: form.bodyTr.trim(), ...(bodyEn ? { en: bodyEn } : {}) },
    target,
    audience: form.audience,
    channels: { banner: form.banner, inApp: form.inApp || form.email, email: form.email },
    startsAt: startsIso.value,
    endsAt: endsIso.value,
    dismissible: undismissable.value ? false : form.dismissible,
  }
})
const blocking = computed(() => (draft.value ? '' : 'Önizleme ve kayıt için başlık, metin, hedef, en az bir kanal ve geçerli bir zaman gerekli.'))

// ---------------------------------------------------------------- yükleme (düzenleme)
const loadState = ref<'loading' | 'ready' | 'error' | 'degraded' | 'notFound' | 'locked'>(isEdit ? 'loading' : 'ready')
const loadError = shallowRef<DescribedError | null>(null)
const ready = computed(() => loadState.value === 'ready')
async function loadExisting() {
  if (!id) return
  loadState.value = 'loading'
  try {
    const { announcement: a } = await api.call('BackofficeNotificationService/getAnnouncement', { id })
    if (a.status !== 'draft') {
      loadState.value = 'locked'
      return
    }
    const i = toInput(a)
    Object.assign(form, {
      kind: i.kind,
      severity: i.severity === DEFAULT_SEVERITY[i.kind] ? null : (i.severity ?? null),
      titleTr: i.title.tr,
      bodyTr: i.body.tr,
      titleEn: i.title.en ?? '',
      bodyEn: i.body.en ?? '',
      targetMode: i.target.mode,
      planCodes: i.target.mode === 'plans' ? i.target.planCodes : [],
      tidsText: i.target.mode === 'tenants' ? i.target.tids.join(', ') : '',
      audience: i.audience ?? 'all_members',
      banner: i.channels.banner,
      inApp: i.channels.inApp,
      email: i.channels.email,
      startsAt: toLocalInput(i.startsAt),
      endsAt: toLocalInput(i.endsAt),
      dismissible: i.dismissible ?? true,
    })
    showEn.value = !!(i.title.en || i.body.en)
    loadState.value = 'ready'
  } catch (e) {
    const d = describeError(e)
    loadError.value = d
    loadState.value = d.kind === 'notFound' ? 'notFound' : d.kind === 'unavailable' ? 'degraded' : 'error'
  }
}

// ---------------------------------------------------------------- canlı önizleme (gönderim yok, yazma yok)
const preview = shallowRef<Preview | null>(null)
const previewPhase = ref<'loading' | 'ready' | 'error' | 'degraded' | 'empty'>('loading')
const previewError = shallowRef<DescribedError | null>(null)
const previewBusy = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
async function refreshPreview() {
  const d = draft.value
  if (!d) {
    previewPhase.value = preview.value ? 'ready' : 'loading'
    return
  }
  const my = ++seq
  previewBusy.value = true
  try {
    const res = await api.call('BackofficeNotificationService/previewAnnouncement', { draft: d })
    if (my !== seq) return
    preview.value = res
    previewPhase.value = 'ready'
    previewError.value = null
  } catch (e) {
    if (my !== seq) return
    previewError.value = describeError(e)
    preview.value = null
    previewPhase.value = previewError.value.kind === 'unavailable' ? 'degraded' : 'error'
  } finally {
    if (my === seq) previewBusy.value = false
  }
}
watch(
  draft,
  () => {
    clearTimeout(timer)
    timer = setTimeout(refreshPreview, 400)
  },
  { deep: true },
)
onBeforeUnmount(() => clearTimeout(timer))

// ---------------------------------------------------------------- kayıt
const save = useGuardedAction(
  async (_ctx: null, reason) => {
    const d = draft.value
    if (!d) throw new Error('invalid')
    return id
      ? api.call('BackofficeNotificationService/updateAnnouncement', { id, announcement: d, reason })
      : api.call('BackofficeNotificationService/createAnnouncement', { announcement: d, reason })
  },
  (r) => {
    notifyAudited(isEdit ? 'Taslak güncellendi.' : 'Taslak oluşturuldu. Yayına almak için zamanlayın.', () => router.push({ path: '/denetim', query: { event: 'backoffice.write' } }))
    router.push(`/sistem/duyurular/${r.announcement.id}`)
  },
)
watch(
  () => save.isOpen.value,
  (open) => {
    if (open) touched.value = true
  },
)

onMounted(async () => {
  if (isEdit) await loadExisting()
  refreshPreview()
})
</script>

<style scoped>
.bo-anne {
  align-items: start;
}
.bo-anne__form {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  min-width: 0;
}
.bo-anne__kinds {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-4);
}
.bo-anne__kind {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--ek-space-1) var(--ek-space-2);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-raised);
  color: var(--ek-color-content-default);
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}
.bo-anne__kind:hover {
  border-color: var(--ek-color-border-strong);
}
.bo-anne__kind:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}
.bo-anne__kind[aria-checked='true'] {
  border-color: var(--ek-color-action);
  background: var(--ek-color-surface-muted);
  box-shadow: inset 0 0 0 1px var(--ek-color-action);
}
.bo-anne__kind .v-icon {
  grid-row: span 2;
  color: var(--ek-color-content-muted);
}
.bo-anne__kind[aria-checked='true'] .v-icon {
  color: var(--ek-color-action);
}
.bo-anne__kind-label {
  font-weight: var(--ek-font-weight-semibold);
  font-size: var(--ek-type-label-size);
}
.bo-anne__kind-hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-anne__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--ek-space-3) var(--ek-space-4);
}
.bo-anne__half {
  flex: 1 1 220px;
}
.bo-anne__hint {
  margin: var(--ek-space-2) 0 0;
  font-size: var(--ek-type-caption-size);
}
.bo-anne__err {
  margin: var(--ek-space-2) 0 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-caption-size);
}
.bo-anne__plans {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--ek-space-4);
  margin: var(--ek-space-3) 0 0;
  padding: 0;
  border: 0;
}
.bo-anne__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin: var(--ek-space-2) 0;
}
.bo-anne__aud {
  margin-top: var(--ek-space-4);
}
.bo-anne__channels {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--ek-space-4);
  margin-bottom: var(--ek-space-2);
}
.bo-anne__preview {
  position: sticky;
  top: var(--ek-space-5);
  min-width: 0;
}
@media (max-width: 959px) {
  .bo-anne__preview {
    position: static;
  }
}
@media (max-width: 599px) {
  .bo-anne__kinds {
    grid-template-columns: 1fr;
  }
}
</style>
