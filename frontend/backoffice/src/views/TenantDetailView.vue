<template>
  <div class="bo-page">
    <EkEmptyState v-if="notFound" variant="no-results" title="Müşteri bulunamadı" :message="`#${tid} numaralı kayıt yok ya da kaldırılmış.`" />
    <template v-else>
      <BoPageHeader :title="title" lede="" :extra-crumbs="[{ label: title }]" :updated-at="life.loadedAt.value ?? undefined" :stale="life.stale.value">
        <template #status>
          <EkStatusChip v-if="life.data.value" :tone="TENANT_STATUS[life.data.value.status].tone" :label="life.data.value.status === 'DELETION_PENDING' ? 'Silme talebi bekliyor' : TENANT_STATUS[life.data.value.status].label" dot />
          <EkStatusChip v-if="life.data.value?.trial" :tone="SUB_STATUS[life.data.value.trial.subscriptionStatus].tone" :label="`Abonelik: ${planLabel(life.data.value.trial.planCode)} · ${SUB_STATUS[life.data.value.trial.subscriptionStatus].label}`" />
          <EkStatusChip v-if="life.data.value?.trial?.billingExempt" tone="neutral" label="Faturalamadan muaf" />
          <EkStatusChip v-if="session.active.value" tone="warning" icon="mdi-account-eye-outline" :label="`Destek oturumu açık · ~${session.text.value}`" data-testid="imp-session-chip" />
        </template>
        <template #meta>
          <span class="bo-tenant__tid ek-num">#{{ tid }}</span>
          <EkCopyButton :value="String(tid)" label="Mağaza numarası" />
        </template>
        <template #actions>
          <EkButton v-if="life.data.value?.deletion?.canCancel" tone="secondary" icon="mdi-undo-variant" data-testid="cancel-deletion" @click="undo.open(tid)">Silme talebini geri al</EkButton>
          <BoAction kind="detail" :to="{ path: '/denetim', query: { tid: String(tid) } }">Denetim kaydı</BoAction>
          <BoAction v-if="life.data.value?.trial" kind="detail" :to="`/abonelikler/${tid}`">Abonelik</BoAction>
          <CopyViewLink />
          <BoAction kind="refresh" :loading="life.refreshing.value" data-page-refresh @click="refresh" />
          <EkButton tone="primary" icon="mdi-account-eye-outline" :disabled="!canImpersonate" data-testid="impersonate" @click="imp.open(tid)">Müşterinin gözünden aç</EkButton>
        </template>
      </BoPageHeader>
      <PageVerdict :verdict="verdict" />

      <p v-if="life.data.value && !canImpersonate" class="bo-tenant__why bo-muted">
        <v-icon icon="mdi-information-outline" aria-hidden="true" />Destek oturumu yalnız aktif mağazada açılabilir (şu an: {{ TENANT_STATUS[life.data.value.status].label.toLocaleLowerCase('tr') }}).
      </p>

      <EkAlert
        v-if="ticket.active.value"
        tone="info"
        title="Destek oturumu bağlantısı yeni sekmede açıldı"
        :text="`Tek kullanımlık bağlantı ${ticket.text.value} içinde kullanılmazsa geçersiz olur. Oturum açıldığında ${IMPERSONATION_SESSION_MINUTES} dakika sürer ve uzatılamaz; kalan süre müşteri uygulamasındaki bantta gösterilir.`"
        data-testid="imp-ticket"
      />

      <BoTabs v-model="tab" :tabs="TABS" label="Müşteri bölümleri" />

      <template v-if="tab === 'ozet'">
        <!-- BE-02: "bu müşteride şu an ne var?" — ana metrikler ve ilk karar bölümleri ilk ekranda; kanal/kuyruk ayrıntısı kapalı. -->
        <section class="bo-tenant__now" aria-label="Şu an" data-testid="tenant-now">
          <StateBlock :phase="health.phase.value" :error="health.error.value" skeleton="detail" :rows="3" @retry="health.load()">
            <div v-if="health.data.value" class="bo-tenant__stack">
              <BoTileGrid :min="176" dense>
                <BoStat
                  label="Açık sorun"
                  :value="isBad('openIssues') ? 'okunamadı' : `~${health.data.value.openIssues.items.length}`"
                  :tone="!isBad('openIssues') && health.data.value.openIssues.items.length ? 'warning' : 'neutral'"
                  hint="Sorun grubu · yaklaşık"
                  :to="{ path: '/loglar', query: { tid: String(tid), sekme: 'sorunlar' } }"
                />
                <BoStat
                  label="Başarısız iş"
                  :value="failedTotal === null ? 'okunamadı' : failedTotal"
                  :tone="failedTotal ? 'warning' : 'neutral'"
                  hint="Kuyruk + elle inceleme"
                  :to="{ path: '/motor', query: { sekme: 'basarisiz', tid: String(tid) } }"
                />
                <BoStat
                  label="Etkin uyarı"
                  :value="isBad('alerts') ? 'okunamadı' : health.data.value.alerts.length"
                  :tone="hasCriticalAlert ? 'critical' : !isBad('alerts') && health.data.value.alerts.length ? 'warning' : 'neutral'"
                  hint="Bu müşteriye ait"
                  :to="{ path: '/bildirimler/uyarilar', query: { durum: 'firing' } }"
                />
                <BoStat
                  label="Son sipariş eşitleme"
                  :value="health.data.value.lastOrderSyncAt ? formatRelative(health.data.value.lastOrderSyncAt) : 'henüz yok'"
                  hint="Başarılı çağrı"
                />
              </BoTileGrid>

              <BoTileGrid :cols="2">
                <BoSection title="Açık sorunlar" description="Bu müşteride tekrarlayan hata grupları" icon="mdi-alert-circle-outline" fill>
                  <p v-if="isBad('openIssues')" class="bo-muted">okunamadı — sağlık özetini yenileyin.</p>
                  <p v-else-if="!health.data.value.openIssues.items.length" class="bo-muted">Açık sorun grubu yok.</p>
                  <ul v-else class="bo-now__list" data-testid="now-issues">
                    <li v-for="g in shownIssues" :key="g.fp">
                      <RouterLink :to="{ path: '/loglar', query: { tid: String(tid), fp: g.fp } }" class="bo-now__row">
                        <span class="bo-now__main">{{ issueLabel(g) }}</span>
                        <span class="bo-muted bo-now__meta"><span class="ek-num">{{ g.count }}</span> olay · {{ formatRelative(g.lastSeen) }}</span>
                      </RouterLink>
                    </li>
                  </ul>
                  <template v-if="!isBad('openIssues') && health.data.value.openIssues.items.length > NOW_ISSUES_LIMIT" #footer>
                    <BoAction kind="detail" size="sm" :to="{ path: '/loglar', query: { tid: String(tid), sekme: 'sorunlar' } }">{{ health.data.value.openIssues.items.length - NOW_ISSUES_LIMIT }} sorun grubu daha</BoAction>
                  </template>
                </BoSection>

                <BoSection title="Etkin uyarılar" description="Şu an tetiklenmiş kurallar" icon="mdi-bell-alert-outline" fill>
                  <p v-if="isBad('alerts')" class="bo-muted">okunamadı — sağlık özetini yenileyin.</p>
                  <p v-else-if="!health.data.value.alerts.length" class="bo-muted">Etkin uyarı yok.</p>
                  <ul v-else class="bo-now__list" data-testid="now-alerts">
                    <li v-for="a in health.data.value.alerts" :key="a.ruleId + a.scopeKey">
                      <RouterLink :to="{ path: '/bildirimler/uyarilar', query: { durum: 'firing' } }" class="bo-now__row">
                        <span class="bo-now__main">{{ a.ruleId }} · {{ a.scopeKey }}</span>
                        <span class="bo-muted bo-now__meta">{{ a.level === 'critical' ? 'Kritik' : 'Uyarı' }} · {{ formatRelative(a.firstFiredAt) }}<template v-if="a.mutedUntil"> · susturulmuş</template></span>
                      </RouterLink>
                    </li>
                  </ul>
                </BoSection>
              </BoTileGrid>
            </div>
          </StateBlock>
        </section>

        <BoTileGrid :cols="2">
          <BoSection title="Hesap" icon="mdi-storefront-outline" fill>
            <EkDescriptionList v-if="client && life.data.value" :items="accountItems" />
            <StateBlock v-else :phase="life.phase.value === 'ready' ? 'loading' : life.phase.value" :error="life.error.value" skeleton="detail" :rows="3" @retry="life.load()" />
            <section aria-labelledby="now-channels" class="bo-tenant__chan">
              <h3 id="now-channels" class="bo-now__h">Kanallar</h3>
              <ul v-if="client?.integrations?.length" class="bo-tenant__channels">
                <li v-for="i in client.integrations" :key="i.integrationCode">
                  <EkChannelDot :code="i.integrationCode" :name="CHANNEL[i.integrationCode] ?? i.integrationCode" variant="plain" />
                  <span class="bo-muted">{{ channelTypeLabel(i.type) }}</span>
                </li>
              </ul>
              <p v-else-if="client" class="bo-muted">Bağlı kanal yok.</p>
              <EkSkeleton v-else type="detail" :rows="2" />
            </section>
          </BoSection>

          <!-- BO-ELEV E5: "bu müşteride ne oluyor?" — her iz ekranına müşteri süzgeciyle tek tıkla. -->
          <BoSection title="İz sür" description="Bu müşteriye süzülmüş kayıtlar" icon="mdi-map-marker-path" fill data-testid="tenant-trace">
            <ul class="bo-trace">
              <li v-for="t in traceLinks" :key="t.label">
                <RouterLink :to="t.to" class="bo-trace__link">
                  <v-icon :icon="t.icon" class="bo-trace__icon" aria-hidden="true" />
                  <span class="bo-trace__text">
                    <span class="bo-trace__label">{{ t.label }}</span>
                    <span class="bo-trace__hint">{{ t.hint }}</span>
                  </span>
                  <v-icon icon="mdi-arrow-right" class="bo-trace__go" aria-hidden="true" />
                </RouterLink>
              </li>
            </ul>
          </BoSection>
        </BoTileGrid>

        <BoSection label="Eşitleme ve kuyruk ayrıntısı">
          <BoCollapsible label="Eşitleme ve kuyruk ayrıntısı" hint="Kanal başına son başarılı çağrı, kuyruk sayıları">
            <div class="bo-tenant__detail">
              <section v-if="health.data.value" aria-labelledby="now-sync">
                <h3 id="now-sync" class="bo-now__h">Son başarılı eşitleme</h3>
                <p v-if="isBad('lastSyncAt')" class="bo-muted">okunamadı</p>
                <ul v-else class="bo-now__list" data-testid="now-sync">
                  <li v-for="(at, code) in health.data.value.lastSyncAt" :key="code" class="bo-now__row bo-now__row--static">
                    <span class="bo-now__main">{{ CHANNEL[code] ?? code }}</span>
                    <span class="bo-muted bo-now__meta">{{ at ? formatRelative(at) : 'başarılı çağrı yok' }}</span>
                  </li>
                  <li class="bo-now__row bo-now__row--static">
                    <span class="bo-now__main">Siparişler</span>
                    <span class="bo-muted bo-now__meta">{{ health.data.value.lastOrderSyncAt ? formatRelative(health.data.value.lastOrderSyncAt) : 'henüz yok' }}</span>
                  </li>
                </ul>
              </section>

              <section v-if="health.data.value" aria-labelledby="now-jobs">
                <h3 id="now-jobs" class="bo-now__h">Başarısız işler</h3>
                <p v-if="isBad('failedJobs')" class="bo-muted">okunamadı</p>
                <ul v-else class="bo-now__list" data-testid="now-jobs">
                  <li>
                    <RouterLink :to="{ path: '/motor', query: { sekme: 'basarisiz', tid: String(tid) } }" class="bo-now__row">
                      <span class="bo-now__main">Kuyruk (BullMQ)</span>
                      <span class="bo-muted bo-now__meta"><template v-if="health.data.value.failedJobs.bullmq === null">okunamadı</template><template v-else><span class="ek-num">{{ health.data.value.failedJobs.bullmq }}</span> başarısız</template></span>
                    </RouterLink>
                  </li>
                  <li>
                    <RouterLink :to="{ path: '/motor', query: { sekme: 'basarisiz', kaynak: 'dlq', tid: String(tid) } }" class="bo-now__row">
                      <span class="bo-now__main">Elle inceleme (ölü mektup)</span>
                      <span class="bo-muted bo-now__meta"><template v-if="health.data.value.failedJobs.dlq === null">okunamadı</template><template v-else><span class="ek-num">{{ health.data.value.failedJobs.dlq }}</span> bekliyor</template></span>
                    </RouterLink>
                  </li>
                </ul>
              </section>
            </div>
          </BoCollapsible>
        </BoSection>
      </template>

      <template v-else-if="tab === 'kullanim'">
        <TenantUsagePanel :tid="tid" />
      </template>

      <template v-else>
        <StateBlock :phase="life.phase.value" :error="life.error.value" skeleton="cards" :rows="3" @retry="life.load()">
          <BoTileGrid v-if="life.data.value" :cols="2">
            <BoSection title="Kurulum" :description="provisionSubtitle" icon="mdi-format-list-checks" fill>
              <EkStatusTimeline :steps="timeline" label="Kurulum adımları" />
            </BoSection>

            <BoSection title="Deneme ve abonelik" icon="mdi-timer-sand" fill>
              <EkDescriptionList v-if="life.data.value.trial" :items="trialItems" />
              <p v-else class="bo-muted">Abonelik kaydı yok.</p>
            </BoSection>

            <BoSection title="Silme süreci" icon="mdi-delete-clock-outline" fill>
              <EkDescriptionList v-if="life.data.value.deletion" :items="deletionItems" />
              <p v-else class="bo-muted">Silme talebi yok.</p>
            </BoSection>

            <BoSection title="Son olaylar" description="Yalnız olay adı, zaman ve sonuç (ayrıntı denetim kaydında)" icon="mdi-history" flush fill>
              <EkEmptyState v-if="!life.data.value.recentEvents.length" variant="no-data" title="Olay yok" message="Bu mağaza için denetim kaydı bulunmuyor." />
              <ul v-else class="bo-tenant__events">
                <li v-for="(e, i) in life.data.value.recentEvents" :key="i">
                  <code class="bo-code">{{ e.event }}</code>
                  <EkStatusChip v-if="e.imp" tone="warning" label="Destek oturumu" />
                  <EkStatusChip :tone="RESULT[e.result].tone" :label="RESULT[e.result].label" dot />
                  <span class="bo-muted bo-tenant__events-meta">{{ e.surface ?? '—' }} · <time :datetime="e.at">{{ formatRelative(e.at) }}</time></span>
                </li>
              </ul>
              <template #footer>
                <div class="bo-tenant__foot">
                  <BoAction kind="detail" size="sm" :to="{ path: '/denetim', query: { tid: String(tid) } }">Denetim kayıtlarında aç</BoAction>
                  <BoAction kind="detail" size="sm" :to="{ path: '/bildirimler/musteri-gecmisi', query: { tid: String(tid) } }" data-testid="notification-history">Bildirim geçmişi</BoAction>
                </div>
              </template>
            </BoSection>
          </BoTileGrid>
        </StateBlock>
      </template>
      <p class="bo-muted bo-tenant__src">Yaşam döngüsü okuması hassas okuma olarak denetime yazılır (BackofficeTenantService/getLifecycle).</p>
    </template>

    <GuardedDialog
      :action="imp"
      title="Müşterinin gözünden açılsın mı?"
      :description="`${title} hesabı yeni sekmede destek oturumuyla açılır.`"
      icon="mdi-account-eye-outline"
      :items="IMP_RULES"
      :tenant="{ tid, name: title }"
      confirm-label="Gerekçeyle aç"
      confirm-icon="mdi-open-in-new"
    />
    <GuardedDialog
      :action="undo"
      title="Silme talebi geri alınsın mı?"
      :description="`${title} yeniden aktif olur; planlanan kalıcı silme iptal edilir.`"
      icon="mdi-undo-variant"
      :items="['Mağaza DELETION_PENDING → ACTIVE durumuna geçer.', 'Müşteri uygulamasına erişim ve eşitlemeler normal akışa döner.', 'Gerekçe denetim kaydına yazılır.']"
      :tenant="{ tid, name: title }"
      confirm-label="Silmeyi geri al"
      confirm-icon="mdi-undo-variant"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  EkAlert,
  EkButton,
  EkCopyButton,
  EkChannelDot,
  EkDescriptionList,
  EkEmptyState,
  EkSkeleton,
  EkStatusChip,
  EkStatusTimeline,
  type EkTimelineStep,
  type StatusTone,
} from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { IMPERSONATION_SESSION_MINUTES, type ClientDto, type TenantLifecycle } from '@bo/api/contract'
import { useCountdown } from '@bo/composables/useCountdown'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import { useTabQuery } from '@bo/composables/useTabQuery'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoCollapsible from '@bo/components/r2/BoCollapsible.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import BoTabs from '@bo/components/r2/BoTabs.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import CopyViewLink from '@bo/components/CopyViewLink.vue'
import { tenantDetailVerdict } from './tenantDetailVerdict'
import type { HealthIssueRef, TenantHealthSummary } from '@bo/api/contracts/ops'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import TenantUsagePanel from '@bo/views/usage/TenantUsagePanel.vue'
import { CHANNEL, SUB_STATUS, TENANT_STATUS, channelTypeLabel, planLabel } from '@bo/utils/labels'
import { formatDate, formatDateTime, formatRelative } from '@bo/utils/format'
import { notify, notifyAudited } from '@bo/utils/toast'
import '@bo/styles/kit.css'

const route = useRoute()
const router = useRouter()
const tid = Number(route.params.tid)
const client = ref<ClientDto | null>(null)
const clientLoaded = ref(false)
const tab = useTabQuery(['ozet', 'kullanim', 'yasam-dongusu'] as const, 'ozet')
const traceLinks = computed(() => {
  const q = { tid: String(tid) }
  return [
    { label: 'Olay akışı', hint: 'Log merkezi · bu müşterinin olayları', icon: 'mdi-pulse', to: { path: '/loglar', query: q } },
    { label: 'Denetim kayıtları', hint: 'Kim, ne zaman, hangi gerekçeyle', icon: 'mdi-shield-search', to: { path: '/denetim', query: q } },
    { label: 'Bildirim geçmişi', hint: 'Gönderilen e-posta ve uygulama içi bildirimler', icon: 'mdi-bell-outline', to: { path: '/bildirimler/musteri-gecmisi', query: q } },
    { label: 'Abonelik', hint: 'Plan, deneme süresi, ödeme durumu', icon: 'mdi-card-account-details-outline', to: `/abonelikler/${tid}` },
  ]
})

const TABS = [
  { value: 'ozet', label: 'Özet', icon: 'mdi-view-grid-outline' },
  { value: 'kullanim', label: 'Kullanım', icon: 'mdi-devices' },
  { value: 'yasam-dongusu', label: 'Yaşam döngüsü', icon: 'mdi-timeline-clock-outline' },
]
const STEP_LABEL: Record<string, string> = {
  client: 'Mağaza kaydı',
  'order-limit': 'Sipariş limiti',
  'central-user': 'Merkezi kullanıcı',
  'tenant-seed': 'Tenant veritabanı',
  'tenant-user': 'Tenant kullanıcısı',
  subscription: 'Abonelik',
  activate: 'Etkinleştirme',
}
const RESULT: Record<'ok' | 'fail' | 'error', { label: string; tone: StatusTone }> = {
  ok: { label: 'Başarılı', tone: 'success' },
  fail: { label: 'Reddedildi', tone: 'warning' },
  error: { label: 'Hata', tone: 'danger' },
}
const IMP_RULES = [
  `Tek kullanımlık bağlantı 60 saniye geçerlidir; oturum ${IMPERSONATION_SESSION_MINUTES} dakika sürer ve uzatılamaz.`,
  'Hesap silme, faturalama, kullanıcı ve entegrasyon ayarı yazma işlemleri bu oturumda kapalıdır.',
  'Müşteri denetim kaydında oturum "Entegrasyonik Destek" olarak ve gerekçesiyle görünür.',
  'Bağlantı yeni sekmede açılır; kopyalanmaz, saklanmaz.',
]

const life = useResource<TenantLifecycle>(() => api.call('BackofficeTenantService/getLifecycle', { tid }))
// BE-02 sağlık özeti (açık sorun, başarısız iş, eşitleme, uyarı). Bölüm okunamazsa `degradedSections` dolar.
const health = useResource<TenantHealthSummary>(() => api.call('BackofficeTenantService/getHealthSummary', { tid }))
const isBad = (section: string) => !!health.data.value?.degradedSections.some((d) => d.section === section)
/** "Şu an" kartında en çok bu kadar sorun grubu (kalanı loglara bağlantı). */
const NOW_ISSUES_LIMIT = 3
const shownIssues = computed(() => (health.data.value?.openIssues.items ?? []).slice(0, NOW_ISSUES_LIMIT))
/** Kuyruk + ölü mektup toplamı; ikisi de okunamadıysa null (sıfır gösterip sağlıklı denmez). */
const failedTotal = computed(() => {
  const f = health.data.value?.failedJobs
  if (!f || isBad('failedJobs') || (f.bullmq === null && f.dlq === null)) return null
  return (f.bullmq ?? 0) + (f.dlq ?? 0)
})
const hasCriticalAlert = computed(() => !isBad('alerts') && !!health.data.value?.alerts.some((a) => a.level === 'critical'))
const issueLabel = (g: HealthIssueRef) => `${g.integrationCode ? (CHANNEL[g.integrationCode] ?? g.integrationCode) : g.module} · ${g.code}`
const notFound = computed(() => life.phase.value === 'notFound' || (clientLoaded.value && !client.value && life.phase.value !== 'loading' && life.phase.value !== 'ready'))
const title = computed(() => client.value?.title ?? life.data.value?.name ?? `#${tid}`)
const canImpersonate = computed(() => life.data.value?.status === 'ACTIVE')

// NT-01: komut paletindeki "Destek oturumu aç" → `?eylem=destek`. Yaşam döngüsü okununca güvenli akış (step-up + gerekçe)
// açılır; sorgu tek kullanımlıktır (yenilemede diyalog yeniden açılmaz).
watch(
  [() => route.query.eylem, () => life.data.value],
  ([eylem, data]) => {
    if (eylem !== 'destek' || !data) return
    const { eylem: _e, ...rest } = route.query
    void router.replace({ query: rest })
    if (canImpersonate.value) imp.open(tid)
    else notify('info', 'Destek oturumu yalnız aktif mağazada açılabilir.')
  },
  { immediate: true },
)

// K41: bilet ömrü sunucu yanıtından (expiresInSeconds); oturum bitişi = başlangıç (impersonation.redeem) + 30 dk (sözleşme §5).
// Backoffice'e oturum `expiresAt` alanı gelmez; son olaylardan türetilen değer "yaklaşık" (~) gösterilir.
const ticketExpiresAt = ref<number | null>(null)
const ticket = useCountdown(ticketExpiresAt)
const sessionExpiresAt = computed(() => {
  const events = life.data.value?.recentEvents ?? []
  const start = events.find((e) => e.event === 'impersonation.redeem' && e.result === 'ok')
  if (!start) return null
  const ended = events.some((e) => e.event === 'impersonation.end' && Date.parse(e.at) >= Date.parse(start.at))
  return ended ? null : Date.parse(start.at) + IMPERSONATION_SESSION_MINUTES * 60_000
})
const session = useCountdown(sessionExpiresAt)

async function refresh() {
  const [list] = await Promise.allSettled([api.call('AdminService/getClients', { search: String(tid), limit: 50 }), life.load(), health.load()])
  // Yenilemede liste okunamazsa son iyi satır korunur.
  if (list.status === 'fulfilled') client.value = list.value.clients.find((c) => c.clientId === tid) ?? null
  clientLoaded.value = true
}
onMounted(refresh)

// Hüküm (Durum → Karar → Eylem): yaşam döngüsü + liste satırı + BE-02 sağlık özeti.
const verdict = computed(() =>
  (life.data.value || (life.phase.value !== 'loading' && life.phase.value !== 'notFound')) && (health.data.value || health.phase.value !== 'loading')
    ? tenantDetailVerdict({
        tid,
        life: life.data.value,
        client: client.value,
        failed: life.data.value === null,
        stale: life.stale.value,
        retry: () => void life.load(),
        health: health.data.value,
        healthFailed: health.data.value === null,
        retryHealth: () => void health.load(),
        tabTo: (t) => ({ query: { ...route.query, sekme: t === 'ozet' ? undefined : t } }),
        impersonate: canImpersonate.value ? () => imp.open(tid) : undefined,
        undoDeletion: () => undo.open(tid),
      })
    : null,
)

const accountItems = computed(() => {
  const c = client.value!
  const l = life.data.value!
  return [
    { label: 'Mağaza numarası (tid)', value: `#${c.clientId}` },
    { label: 'Durum', value: TENANT_STATUS[l.status].label },
    { label: 'Plan', value: planLabel(l.trial?.planCode) },
    { label: 'Deneme bitişi', value: l.trial?.trialEndsAt ? formatDate(l.trial.trialEndsAt) : '—' },
    { label: 'Kayıt', value: formatDate(c.createdAt) },
    { label: 'Son sipariş eşitleme', value: l.lastSuccessfulOrderSync ? formatDateTime(l.lastSuccessfulOrderSync) : '—' },
  ]
})

const timeline = computed<EkTimelineStep[]>(() =>
  (life.data.value?.provisioning.steps ?? []).map((s) => ({
    key: s.step,
    label: STEP_LABEL[s.step] ?? s.step,
    state: s.state === 'done' ? 'done' : s.state === 'failed' ? 'failed' : 'upcoming',
  })),
)
const provisionSubtitle = computed(() => {
  const p = life.data.value?.provisioning
  if (!p) return ''
  if (p.failedStep) return `"${STEP_LABEL[p.failedStep] ?? p.failedStep}" adımında durdu${p.failedAt ? ` · ${formatDateTime(p.failedAt)}` : ''}`
  if (p.steps.every((s) => s.state === 'done')) return 'Tüm adımlar tamamlandı'
  return 'Kurulum sürüyor'
})
const trialItems = computed(() => {
  const t = life.data.value!.trial!
  return [
    { label: 'Abonelik durumu', value: SUB_STATUS[t.subscriptionStatus].label },
    { label: 'Plan', value: planLabel(t.planCode) },
    { label: 'Deneme bitişi', value: t.trialEndsAt ? formatDateTime(t.trialEndsAt) : '—' },
    { label: 'Kalan gün', value: t.daysLeft === null ? '—' : `${t.daysLeft} gün` },
    { label: 'Faturalama', value: t.billingExempt ? 'Muaf' : 'Ücretli' },
  ]
})
const deletionItems = computed(() => {
  const d = life.data.value!.deletion!
  return [
    { label: 'Talep', value: d.requestedAt ? formatDateTime(d.requestedAt) : '—' },
    { label: 'Planlanan silme', value: d.scheduledAt ? formatDateTime(d.scheduledAt) : '—' },
    { label: 'Kalan', value: d.daysUntilPurge === null ? '—' : `${d.daysUntilPurge} gün` },
    { label: 'Silindi', value: d.purgedAt ? formatDateTime(d.purgedAt) : '—' },
    ...(d.purgeFailedStep ? [{ label: 'Silme hatası', value: d.purgeFailedStep }] : []),
  ]
})
const imp = useGuardedAction(
  (id: number, reason) => api.call('BackofficeTenantService/startImpersonation', { tid: id, reason }),
  ({ url, expiresInSeconds }) => {
    // Bilet URL'i yalnız yeni sekmeye verilir: saklanmaz, loglanmaz, kopyalanmaz; noopener/noreferrer ile opener ve Referer yok.
    window.open(url, '_blank', 'noopener,noreferrer')
    ticketExpiresAt.value = Date.now() + Math.max(0, expiresInSeconds) * 1000
    notifyAudited(`Müşteri hesabı yeni sekmede açıldı. Destek oturumu ${IMPERSONATION_SESSION_MINUTES} dakika sürer.`, () => router.push({ path: '/denetim', query: { event: 'impersonation.start' } }))
  },
)
const undo = useGuardedAction(
  (id: number, reason) => api.call('BackofficeTenantService/cancelDeletion', { tid: id, reason }),
  () => {
    notifyAudited('Silme talebi geri alındı; mağaza aktif.', () => router.push({ path: '/denetim', query: { event: 'backoffice.write' } }))
    life.load()
  },
)
</script>

<style scoped>
.bo-tenant__tid {
  color: var(--ek-color-content-muted);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-label-size);
}
.bo-tenant__why {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: calc(var(--ek-space-3) * -1) 0 0;
  font-size: var(--ek-type-label-size);
}
.bo-tenant__stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}
.bo-tenant__now {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}
.bo-tenant__detail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-5);
  padding-top: var(--ek-space-3);
}
.bo-tenant__chan {
  margin-top: var(--ek-space-4);
  padding-top: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}
.bo-tenant__foot {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
}
.bo-now__h {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-now__n {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}
.bo-now__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.bo-now__list li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}
.bo-now__row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ek-space-1) var(--ek-space-3);
  padding: var(--ek-space-2);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  text-decoration: none;
  transition: var(--ek-transition-colors);
}
a.bo-now__row:hover {
  background: var(--ek-color-surface-muted);
}
a.bo-now__row:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}
.bo-now__main {
  /* `ruleId · scopeKey` ve uzun sorun adları kesintisiz olabilir: dar ekranda satırı taşırmasın. */
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}
.bo-now__meta {
  font-size: var(--ek-type-caption-size);
}
.bo-trace {
  margin: 0;
  padding: 0;
  list-style: none;
}
.bo-trace li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}
.bo-trace__link {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-default);
  text-decoration: none;
  transition: var(--ek-transition-colors);
}
.bo-trace__link:hover {
  background: var(--ek-color-surface-muted);
}
.bo-trace__link:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}
.bo-trace__icon,
.bo-trace__go {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}
.bo-trace__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.bo-trace__label {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
}
.bo-trace__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-tenant__channels,
.bo-tenant__events {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.bo-tenant__channels li {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}
.bo-tenant__channels li .bo-muted {
  margin-left: auto;
  font-size: var(--ek-type-caption-size);
}
.bo-tenant__events {
  gap: 0;
}
.bo-tenant__events li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}
.bo-tenant__events li:first-child {
  border-top: 0;
}
.bo-tenant__events-meta {
  margin-left: auto;
  font-size: var(--ek-type-caption-size);
}
.bo-tenant__src {
  margin: 0;
  font-size: var(--ek-type-caption-size);
}
@media (max-width: 1023px) {
  .bo-tenant__detail {
    grid-template-columns: 1fr;
  }
}
</style>
