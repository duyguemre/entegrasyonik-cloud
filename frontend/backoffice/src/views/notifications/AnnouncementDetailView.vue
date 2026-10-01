<template>
  <div class="bo-page">
    <EkEmptyState v-if="res.phase.value === 'notFound'" variant="no-results" title="Duyuru bulunamadı" message="Duyuru silinmiş ya da bağlantı hatalı olabilir; listeye dönün." />
    <StateBlock v-else-if="!a" :phase="res.phase.value" :error="res.error.value" skeleton="detail" :rows="4" degraded-title="Duyuru şu an okunamıyor" @retry="res.load()" />
    <template v-else>
      <BoPageHeader :title="a.title.tr" lede="" :extra-crumbs="[{ label: a.title.tr }]" :updated-at="res.loadedAt.value ?? undefined">
        <template #status>
          <EkStatusChip :tone="ANN_STATUS[a.status].tone" :label="ANN_STATUS[a.status].label" dot data-testid="ann-status" />
          <EkStatusChip :tone="ANN_SEVERITY[a.severity].tone" :label="`${ANN_KIND[a.kind].label} · ${ANN_SEVERITY[a.severity].label}`" :icon="ANN_KIND[a.kind].icon" />
        </template>
        <template #meta>
          <span class="bo-mono">{{ a.id }}</span>
          <EkCopyButton :value="a.id" label="Duyuru kimliği" />
        </template>
        <template #actions>
          <EkButton v-if="a.status === 'draft'" tone="secondary" icon="mdi-pencil-outline" data-testid="edit" @click="router.push(`/sistem/duyurular/${a.id}/duzenle`)">Düzenle</EkButton>
          <EkButton v-if="a.status === 'draft'" tone="primary" :icon="startsInFuture ? 'mdi-calendar-clock' : 'mdi-send-outline'" data-testid="schedule" @click="openSchedule">
            {{ startsInFuture ? 'Zamanla' : 'Şimdi yayınla' }}
          </EkButton>
          <EkButton v-if="cancellable" tone="danger" icon="mdi-cancel" data-testid="cancel" @click="cancel.open(a.id)">İptal et</EkButton>
          <EkRefreshButton quiet-success :loading="res.refreshing.value" @refresh="reload" />
        </template>
      </BoPageHeader>

      <EkAlert v-if="res.stale.value && res.error.value" tone="warning" title="Güncel veri alınamadı" :text="res.error.value.message" />
      <EkAlert v-if="note" :tone="note.tone" dense :title="note.title" :text="note.text" data-testid="ann-note" />
      <EkAlert v-if="a.status === 'draft'" tone="info" dense title="Taslak — müşteriler henüz görmüyor" :text="draftText" />
      <EkAlert v-else-if="a.status === 'ended' || a.status === 'cancelled'" tone="info" dense title="Bu duyuru artık değiştirilemez" text="Gönderilmiş uygulama içi bildirimler ve e-postalar geri alınmaz. Yeni bir duyuru oluşturabilirsiniz." />

      <div class="bo-grid-2 bo-annd__grid">
        <div class="bo-annd__col">
          <EkCard title="Kapsam ve zaman" icon="mdi-target">
            <dl class="bo-kv">
              <div><dt>Hedef</dt><dd data-testid="target">{{ targetText(a.target) }}</dd></div>
              <div><dt>Kitle</dt><dd>{{ ANN_AUDIENCE[a.audience] }}</dd></div>
              <div><dt>Kanallar</dt><dd>{{ channelsText(a.channels) }}</dd></div>
              <div><dt>Görünme penceresi</dt><dd class="ek-num">{{ windowText(a) }}</dd></div>
              <div><dt>Kapatılabilir</dt><dd>{{ a.dismissible ? 'Evet' : 'Hayır (bakım / olay)' }}</dd></div>
              <div v-if="a.channels.email"><dt>Hizmet duyurusu onayı</dt><dd class="ek-num">{{ a.emailConsentAt ? formatDateTime(a.emailConsentAt) : 'Zamanlarken istenir' }}</dd></div>
            </dl>
            <p v-if="a.target.mode === 'tenants' && a.target.tids.length > 4" class="bo-annd__tids bo-mono">{{ a.target.tids.map((n) => `#${n}`).join(' ') }}</p>
          </EkCard>

          <EkCard title="Dağıtım" icon="mdi-send-check-outline" :subtitle="a.fanout ? (a.fanout.done ? 'Tamamlandı' : 'Sürüyor') : 'Henüz dağıtılmadı'">
            <dl v-if="a.fanout" class="bo-kv">
              <div><dt>İşlenen müşteri</dt><dd class="ek-num">{{ formatCount(a.fanout.tenants) }}</dd></div>
              <div><dt>Üretilen bildirim</dt><dd class="ek-num">{{ formatCount(a.fanout.notified) }}</dd></div>
            </dl>
            <p v-else class="bo-muted bo-annd__p">
              Bant, başlangıç zamanında hesaplanarak görünür. Uygulama içi ve e-posta dağıtımı yayın anında her hedef müşteriye bir kez yapılır.
            </p>
            <template v-if="a.channels.email && a.fanout" #footer>
              <RouterLink :to="{ path: '/bildirimler/teslimler', query: { kod: 'SYSTEM_ANNOUNCEMENT' } }" class="bo-annd__more">E-posta teslimlerini aç <v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
            </template>
          </EkCard>

          <EkCard title="Metin" icon="mdi-text-box-outline">
            <div class="bo-annd__text">
              <h3>Türkçe</h3>
              <p class="bo-annd__t">{{ a.title.tr }}</p>
              <p class="bo-annd__b">{{ a.body.tr }}</p>
              <h3>English</h3>
              <template v-if="a.title.en || a.body.en">
                <p class="bo-annd__t">{{ a.title.en ?? a.title.tr }}</p>
                <p class="bo-annd__b">{{ a.body.en ?? a.body.tr }}</p>
              </template>
              <p v-else class="bo-muted bo-annd__p">İngilizce metin yok; İngilizce kullanan üyeler Türkçe metni görür.</p>
            </div>
          </EkCard>

          <EkCard title="Kayıt" icon="mdi-history" :heading-level="3">
            <dl class="bo-kv">
              <div><dt>Oluşturuldu</dt><dd class="ek-num">{{ formatDateTime(a.createdAt) }}</dd></div>
              <div><dt>Son değişiklik</dt><dd class="ek-num">{{ formatDateTime(a.updatedAt) }}</dd></div>
              <div><dt>Oluşturan</dt><dd class="bo-mono">{{ a.createdBy }}</dd></div>
              <div v-if="a.scheduledBy"><dt>Yayına alan</dt><dd class="bo-mono">{{ a.scheduledBy }}</dd></div>
              <div v-if="a.cancelledBy"><dt>İptal eden</dt><dd class="bo-mono">{{ a.cancelledBy }}</dd></div>
            </dl>
            <template #footer>
              <RouterLink :to="{ path: '/denetim', query: { event: 'backoffice.write' } }" class="bo-annd__more">Denetim kayıtlarında aç <v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
            </template>
          </EkCard>
        </div>

        <EkCard class="bo-annd__preview">
          <AnnouncementPreview :preview="pv.data.value" :channels="a.channels" :phase="pv.phase.value" :error="pv.error.value" :refreshing="pv.refreshing.value" @retry="pv.load()" />
        </EkCard>
      </div>
    </template>

    <GuardedDialog
      :action="schedule"
      :title="startsInFuture ? 'Duyuru zamanlansın mı?' : 'Duyuru şimdi yayınlansın mı?'"
      irreversible
      :description="a ? `${a.title.tr} · ${targetText(a.target)}` : ''"
      icon="mdi-send-outline"
      :items="scheduleItems"
      :scope="a ? `${targetText(a.target)} · ${ANN_AUDIENCE[a.audience]}` : undefined"
      :confirm-label="startsInFuture ? 'Gerekçeyle zamanla' : 'Gerekçeyle yayınla'"
      confirm-icon="mdi-send-outline"
      :confirm-disabled="!!a?.channels.email && !emailConsent"
    >
      <v-checkbox
        v-if="a?.channels.email"
        v-model="emailConsent"
        density="compact"
        hide-details="auto"
        data-testid="email-consent"
        label="Bu e-posta yalnızca hizmet duyurusudur; pazarlama içeriği yoktur."
        :error-messages="emailConsent ? undefined : 'E-posta kanalı için bu onay zorunludur.'"
      />
    </GuardedDialog>
    <GuardedDialog
      :action="cancel"
      title="Duyuru iptal edilsin mi?"
      danger
      :description="a ? a.title.tr : ''"
      icon="mdi-cancel"
      :items="[
        a?.status === 'active' ? 'Bant müşteri ekranlarından hemen kalkar.' : 'Duyuru yayına alınmaz; bant hiç görünmez.',
        'Gönderilmiş uygulama içi bildirimler ve e-postalar geri alınmaz.',
        'İptal edilen duyuru yeniden açılamaz; gerekirse yeni duyuru oluşturun.',
      ]"
      confirm-label="Duyuruyu iptal et"
      confirm-icon="mdi-cancel"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkButton, EkCard, EkCopyButton, EkEmptyState, EkRefreshButton, EkStatusChip } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { Announcement, AnnouncementPreview as Preview } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import { ANN_AUDIENCE, ANN_KIND, ANN_SEVERITY, ANN_STATUS } from '@bo/utils/labels'
import { formatDateTime } from '@bo/utils/format'
import { formatCount } from '@bo/utils/units'
import { notifyAudited } from '@bo/utils/toast'
import AnnouncementPreview from './AnnouncementPreview.vue'
import { channelsText, targetText, windowText } from './announcementText'
import { announcementNote } from './notificationsVerdict'
import '@bo/styles/kit.css'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)

const res = useResource<{ announcement: Announcement }>(() => api.call('BackofficeNotificationService/getAnnouncement', { id }))
const pv = useResource<Preview>(() => api.call('BackofficeNotificationService/previewAnnouncement', { id }))
const a = computed(() => res.data.value?.announcement ?? null)
const note = computed(() => (a.value ? announcementNote(a.value, Date.now()) : null))
const startsInFuture = computed(() => !!a.value && Date.parse(a.value.startsAt) > Date.now())
const cancellable = computed(() => !!a.value && ['draft', 'scheduled', 'active'].includes(a.value.status))
const draftText = computed(() =>
  startsInFuture.value
    ? `Zamanladığınızda ${a.value ? formatDateTime(a.value.startsAt) : ''} tarihinde yayına girer.`
    : 'Başlangıç zamanı geçmiş: zamanladığınızda hemen yayına girer.',
)

function reload() {
  res.load()
  pv.load()
}

const emailConsent = ref(false)
const scheduleItems = computed(() => {
  const x = a.value
  if (!x) return []
  return [
    startsInFuture.value ? `Duyuru ${formatDateTime(x.startsAt)} tarihinde yayına girer; o ana kadar iptal edilebilir.` : 'Duyuru hemen yayına girer.',
    `Kanallar: ${channelsText(x.channels)}. ${x.channels.inApp || x.channels.email ? 'Her hedef müşteriye bir kez bildirim üretilir; gönderilen bildirim geri alınmaz.' : 'Yalnız bant: bildirim üretilmez.'}`,
    ...(x.channels.email ? ['E-posta yalnız doğrulanmış adresli ve sistem e-postasını kapatmamış üyelere gider; toplu gönderim denetime ayrıca yazılır.'] : []),
    'Zamanlanan duyuru artık düzenlenemez; değişiklik için iptal edip yenisini oluşturun.',
  ]
})
function openSchedule() {
  emailConsent.value = false
  schedule.open(id)
}
const schedule = useGuardedAction(
  (aid: string, reason) =>
    api.call('BackofficeNotificationService/scheduleAnnouncement', { id: aid, reason, ...(a.value?.channels.email ? { emailConsent: emailConsent.value } : {}) }),
  (r) => {
    const s = r.announcement.status
    notifyAudited(s === 'active' ? 'Duyuru yayına alındı.' : `Duyuru ${formatDateTime(r.announcement.startsAt)} için zamanlandı.`, () => router.push({ path: '/denetim', query: { event: 'backoffice.write' } }))
    // Yanıt nesnesi yeni kopya olarak yazılır (aynı referans hesaplanan değeri tetiklemez).
    res.data.value = { announcement: { ...r.announcement } }
    pv.load()
  },
)
const cancel = useGuardedAction(
  (aid: string, reason) => api.call('BackofficeNotificationService/cancelAnnouncement', { id: aid, reason }),
  (r) => {
    notifyAudited('Duyuru iptal edildi.', () => router.push({ path: '/denetim', query: { event: 'backoffice.write' } }))
    res.data.value = { announcement: { ...r.announcement } }
  },
)

onMounted(reload)
</script>

<style scoped>
.bo-annd__grid {
  align-items: start;
}
.bo-annd__col {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  min-width: 0;
}
.bo-annd__preview {
  position: sticky;
  top: var(--ek-space-5);
  min-width: 0;
}
.bo-annd__p {
  margin: 0;
  font-size: var(--ek-type-label-size);
}
.bo-annd__tids {
  margin: var(--ek-space-3) 0 0;
  font-size: var(--ek-type-caption-size);
  overflow-wrap: anywhere;
}
.bo-annd__text h3 {
  margin: var(--ek-space-3) 0 var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: var(--ek-type-micro-tracking, 0.04em);
  text-transform: uppercase;
}
.bo-annd__text h3:first-child {
  margin-top: 0;
}
.bo-annd__t {
  margin: 0;
  font-weight: var(--ek-font-weight-semibold);
}
.bo-annd__b {
  margin: var(--ek-space-1) 0 0;
  white-space: pre-line;
}
.bo-annd__more {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-action);
  font-size: var(--ek-type-label-size);
  text-decoration: none;
}
.bo-annd__more:hover {
  text-decoration: underline;
}
@media (max-width: 959px) {
  .bo-annd__preview {
    position: static;
  }
}
</style>
