<!--
  Genel bakış — triyaj panosu (BO-R1, K51; BO_UI_PATTERNS §11). Bilgi yığmaz; dört soruyu SIRAYLA yanıtlar:
  1 sistemde müdahale gereken var mı · 2 büyük resimde kullanım · 3 müşterilerde müdahale gereken var mı · 4 genel kullanım.
  Üstte DURUM (hüküm + sağlık rozeti + önerilen ilk adım), altta katlanır AYRINTI (teknik paneller).
  Veri tek adaptörden (src/api/attention.ts): getAttention + getPulse; uç yoksa getHealth geri düşüşü.
-->
<template>
  <div class="bo-page bo-ov">
    <BoPageHeader :updated-at="checkedAt" :stale="stale" :auto-refresh="30">
      <template #actions>
        <BoAction kind="refresh" :loading="loading" data-page-refresh @click="load" />
      </template>
    </BoPageHeader>

    <!-- 1 · DURUM: hüküm + önerilen ilk adım -->
    <BoPanelState v-if="!attention && attentionError" state="error" :error="attentionError" error-text="Genel durum okunamadı" :retrying="loading" @retry="load" />
    <BoStatusHeader v-else :health="health" :verdict="verdict" :summary="summary" :facts="facts" :badge-label="badgeLabel" :loading="!attention">
      <BoActionCard
        v-if="first"
        eyebrow="Önerilen ilk adım"
        :tone="first.severity === 'critical' ? 'critical' : 'warning'"
        :icon="first.severity === 'critical' ? 'mdi-alert-octagon-outline' : 'mdi-lightbulb-on-outline'"
        :title="firstTitle"
        :text="first.advice ?? first.why"
        :action-label="first.action!.label"
        :to="first.action!.to"
      />
    </BoStatusHeader>

    <!-- BO2-P1: önemli metrikler öne — tek bakışta sayı; ayrıntı kutunun bağlantısında / ipucunda. -->
    <section class="bo-ov-kpis" aria-label="Önemli metrikler" data-testid="overview-kpis">
      <BoTileGrid :min="176" dense>
        <BoStat v-for="({ key, ...k }) in kpis" :key="key" v-bind="k" :data-kpi="key" />
      </BoTileGrid>
    </section>

    <!-- 2 · KARAR (sistem) + sakin büyük resim — aynı satır, eş yükseklik -->
    <BoTileGrid :cols="2" class="bo-ov-row">
      <BoTriageSection id="sistem" :index="1" question="Sistemde müdahale gereken var mı?" :health="sys.health" :answer="sys.answer" :more="{ label: 'Uyarılar', to: { name: 'alerts' } }">
        <BoAttentionList
          compact
          :items="sys.items"
          :limit="narrow ? 2 : 3"
          :total="attention?.total.system ?? 0"
          :state="listState"
          :error="attentionError"
          :retrying="loading"
          :checks="attention?.checks.system ?? []"
          :degraded="attention?.degraded.system ?? []"
          list-label="Sistemde dikkat isteyenler"
          ok-title="Sistem tarafında müdahale gereken bir şey yok"
          ok-text="Bağımlılıklar hazır; kuyruk, hata oranı ve kanal bağlantıları olağan aralıkta."
          @retry="load"
        />
      </BoTriageSection>

      <BoTriageSection id="buyuk-resim" :index="2" question="Kullanım büyük resimde nasıl?" :health="big.health" :answer="big.answer" :calm="big.health === 'ok'" lede="Son 24 saat; değişim 7 günlük ortalamaya göre.">
        <BoPanelState v-if="pulseState !== 'ready'" :state="pulseState" :error="pulseError" :rows="5" empty-title="Kullanım özeti henüz bağlı değil" empty-text="Sunucu bu özeti sağladığında trendler burada görünür. O zamana dek: Entegrasyonlar › API sağlığı." empty-icon="mdi-chart-line-variant" @retry="load" />
        <PulseTrends v-else-if="pulse" :model="pulse" />
      </BoTriageSection>
    </BoTileGrid>

    <!-- 3 · KARAR (müşteriler) + 4 genel kullanım -->
    <BoTileGrid :cols="2" class="bo-ov-row">
      <BoTriageSection id="musteriler" :index="3" question="Müşterilerimde müdahale gereken var mı?" :health="ten.health" :answer="ten.answer" :more="{ label: 'Müşteriler', to: { name: 'tenants' } }">
        <BoAttentionList
          compact
          :items="ten.items"
          :total="attention?.total.tenant ?? 0"
          :state="attention?.source === 'fallback' ? 'unsupported' : listState"
          :error="attentionError"
          :retrying="loading"
          :checks="attention?.checks.tenant ?? []"
          :degraded="attention?.degraded.tenant ?? []"
          list-label="Müşterilerde dikkat isteyenler"
          :limit="narrow ? 2 : 3"
          ok-title="Müşterilerde müdahale gereken bir şey yok"
          ok-text="Entegrasyon hatası, eşitleme gecikmesi, ödeme sorunu ya da bekleyen kurulum yok."
          unsupported-title="Müşteri denetimleri henüz bağlı değil"
          unsupported-text="Sunucu müşteri bazlı dikkat özetini sağladığında burada görünür. O zamana dek müşteri listesinden ve aboneliklerden izleyin."
          @retry="load"
        />
      </BoTriageSection>

      <BoTriageSection id="kullanim" :index="4" question="Genel kullanım nasıl?" calm :answer="usageAnswer" :more="{ label: 'Abonelikler', to: { name: 'subscriptions' } }">
        <BoPanelState v-if="pulseState !== 'ready'" :state="pulseState" :error="pulseError" :rows="4" empty-title="Kullanım özeti henüz bağlı değil" empty-text="Abonelik ve gelir ayrıntısı: Abonelikler › gelir." empty-icon="mdi-account-group-outline" @retry="load" />
        <UsageSummary v-else-if="pulse" :model="pulse" />
      </BoTriageSection>
    </BoTileGrid>

    <!-- AYRINTI -->
    <BoDetailSection id="teknik" title="Teknik ayrıntılar" summary="Bağımlılıklar ve podlar · kuyruk sayaçları · veri alımı · son yönetim işlemleri" sync-query>
      <TechDetails :tick="tick" />
    </BoDetailSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoPanelState, { type PanelState } from '@bo/components/shell/BoPanelState.vue'
import BoStatusHeader, { type StatusFact } from '@bo/components/triage/BoStatusHeader.vue'
import BoAttentionList, { type AttentionState } from '@bo/components/triage/BoAttentionList.vue'
import BoActionCard from '@bo/components/triage/BoActionCard.vue'
import BoTriageSection from '@bo/components/triage/BoTriageSection.vue'
import BoDetailSection from '@bo/components/triage/BoDetailSection.vue'
import { countText, healthOf, type Health } from '@bo/components/triage/triage'
import { loadAttention, loadPulse, type AttentionItem, type AttentionModel, type PulseModel } from '@bo/api/attention'
import PulseTrends from './overview/PulseTrends.vue'
import UsageSummary from './overview/UsageSummary.vue'
import TechDetails from './overview/TechDetails.vue'
import { formatMinor } from '@bo/utils/units'
import '@bo/styles/kit.css'

const REFRESH_MS = 30_000

const loading = ref(false)
const checkedAt = ref<number>()
const stale = ref(false)
const tick = ref(0)
const attention = ref<AttentionModel | null>(null)
const attentionError = ref<unknown>(null)
/** undefined = henüz yüklenmedi · null = uç yok (henüz bağlı değil). */
const pulse = ref<PulseModel | null | undefined>(undefined)
const pulseError = ref<unknown>(null)

async function load() {
  if (loading.value) return
  loading.value = true
  const [a, p] = await Promise.allSettled([loadAttention(), loadPulse()])
  // Yenileme başarısızsa son iyi görüntü korunur ve "bayat" işaretlenir; "Güncellendi" yalnız başarılı okumada ilerler.
  if (a.status === 'fulfilled') {
    attention.value = a.value
    attentionError.value = null
    checkedAt.value = Date.now()
    stale.value = false
  } else if (!attention.value) attentionError.value = a.reason
  else stale.value = true
  if (p.status === 'fulfilled') {
    pulse.value = p.value
    pulseError.value = null
  } else if (pulse.value === undefined) pulseError.value = p.reason
  tick.value++
  loading.value = false
}

// Mobilde (< 600 px) önce hüküm ve sayılar: listeler 2 maddeyle açılır (kritikler her zaman görünür).
const narrow = ref(false)
let mq: MediaQueryList | undefined
const onMq = () => (narrow.value = !!mq?.matches)

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  mq = window.matchMedia('(max-width: 600px)')
  onMq()
  mq.addEventListener('change', onMq)
  void load()
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void load()
  }, REFRESH_MS)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  mq?.removeEventListener('change', onMq)
})

// ------------------------------------------------------------ türetilmiş durum
const items = computed<AttentionItem[]>(() => (attention.value ? [...attention.value.items.system, ...attention.value.items.tenant] : []))
const listState = computed<AttentionState>(() => (attention.value ? 'ready' : attentionError.value ? 'error' : 'loading'))

function scopeSummary(list: AttentionItem[], degraded: string[], unsupported = false): { items: AttentionItem[]; health: Health; answer: string } {
  if (unsupported) return { items: list, health: 'unknown', answer: 'Bağlı değil' }
  if (!attention.value) return { items: list, health: 'unknown', answer: '' }
  const health = healthOf(list, degraded.length > 0)
  const urgent = list.filter((i) => i.severity !== 'info')
  const answer = urgent.length ? `Evet · ${countText(urgent)}` : degraded.length ? 'Eksik veri' : list.length ? `Hayır · ${countText(list)}` : 'Hayır'
  return { items: list, health: urgent.length || !degraded.length ? health : 'warning', answer }
}

const sys = computed(() => scopeSummary(attention.value?.items.system ?? [], attention.value?.degraded.system ?? []))
const ten = computed(() => scopeSummary(attention.value?.items.tenant ?? [], attention.value?.degraded.tenant ?? [], attention.value?.source === 'fallback'))

const degradedAll = computed(() => [...(attention.value?.degraded.system ?? []), ...(attention.value?.degraded.tenant ?? [])])
const critical = computed(() => items.value.filter((i) => i.severity === 'critical'))
const warnings = computed(() => items.value.filter((i) => i.severity === 'warning'))

const health = computed<Health>(() => {
  if (critical.value.length) return 'critical'
  if (warnings.value.length || degradedAll.value.length) return 'warning'
  return 'ok'
})
const badgeLabel = computed(() => (!critical.value.length && !warnings.value.length && degradedAll.value.length ? 'Kısmi bozulma' : undefined))

const verdict = computed(() => {
  const c = critical.value.length
  const w = warnings.value.length
  if (c) return `${c} konu şimdi müdahale istiyor${w ? `; ${w} konu izlenmeli` : ''}`
  if (w) return `Acil bir şey yok; ${w} konu izlenmeli`
  if (degradedAll.value.length) return `${degradedAll.value.join(', ')} okunamadı — durum eksik olabilir`
  return 'Her şey yolunda'
})

const summary = computed(() => {
  if (critical.value.length || warnings.value.length) return 'Maddeler önem sırasıyla aşağıda; her birinde ne yapmanız gerektiği ve ilgili ekrana tek tıkla geçiş var.'
  const infos = items.value.length
  const scope = attention.value?.source === 'fallback' ? 'Sistem denetimleri olağan; müşteri denetimleri henüz bağlı değil.' : 'Sistem ve müşteri denetimleri olağan aralıkta.'
  return infos ? `${scope} ${infos} bilgi notu var.` : scope
})

const facts = computed<StatusFact[]>(() => {
  if (!attention.value) return []
  const f = (label: string, s: { items: AttentionItem[]; health: Health; answer: string }, href: string): StatusFact => ({
    label,
    value: s.answer === 'Bağlı değil' ? 'bağlı değil' : countText(s.items) || 'sorun yok',
    tone: s.health,
    href,
  })
  return [f('Sistem', sys.value, '#sistem'), f('Müşteriler', ten.value, '#musteriler')]
})

/** Önerilen ilk adım: en önemli (ve en uzun süren) kritik/uyarı maddesi. */
// Aynı önemde SİSTEM maddesi önce: çok müşteriyi etkileyen sorun tek müşterili sorundan önce ele alınır.
const first = computed(() => {
  const urgent = items.value.filter((i) => i.severity !== 'info' && i.action)
  const top = urgent.reduce<AttentionItem['severity'] | undefined>((t, i) => (t === 'critical' || i.severity === 'critical' ? 'critical' : 'warning'), undefined)
  return urgent.find((i) => i.severity === top && i.scope === 'system') ?? urgent.find((i) => i.severity === top)
})
const firstTitle = computed(() => {
  const f = first.value
  if (!f) return ''
  const s = f.subjects
  if (s.length === 1) return `${f.title} — #${s[0].tid}${s[0].name ? ` ${s[0].name}` : ''}`
  return f.count ? `${f.title} (${f.count})` : f.title
})

// ------------------------------------------------------------ önemli metrikler (BO2-P1)
const nf = new Intl.NumberFormat('tr-TR')
interface Kpi {
  key: string
  label: string
  value: string | number
  hint?: string
  info?: string
  tone?: 'neutral' | 'critical' | 'warning' | 'success' | 'info'
  delta?: { text: string; dir: 'up' | 'down' | 'flat' }
  series?: number[]
  to?: string | Record<string, unknown>
  loading?: boolean
}
const kpis = computed<Kpi[]>(() => {
  const ready = !!attention.value
  const c = critical.value.length
  const w = warnings.value.length
  const row = (key: string) => pulse.value?.rows.find((r) => r.key === key)
  const http = row('http')
  const err = row('http5xx')
  const usage = pulse.value?.usage
  const tenants = usage?.tenants.state === 'ok' ? usage.tenants : null
  const mrr = usage?.mrr.state === 'ok' ? usage.mrr : null
  const pulseLoading = pulse.value === undefined && !pulseError.value
  return [
    {
      key: 'critical',
      label: 'Kritik konu',
      value: ready ? c : '—',
      loading: !ready && !attentionError.value,
      tone: c ? 'critical' : 'neutral',
      hint: ready ? (c ? 'Şimdi müdahale gerekli' : 'Şimdi müdahale gereken yok') : undefined,
      to: '#sistem',
    },
    {
      key: 'warning',
      label: 'İzlenecek konu',
      value: ready ? w : '—',
      loading: !ready && !attentionError.value,
      tone: w ? 'warning' : 'neutral',
      hint: ready ? `Sistem ${sys.value.items.filter((i) => i.severity === 'warning').length} · müşteri ${ten.value.items.filter((i) => i.severity === 'warning').length}` : undefined,
      to: '#sistem',
    },
    {
      key: 'http',
      label: 'API isteği · 24 sa',
      value: http?.value ?? '—',
      loading: pulseLoading,
      hint: http?.note,
      delta: undefined,
      series: http?.series ?? undefined,
      info: '7 günlük ortalamaya göre değişim; çizgi son 24 saatin saatlik istek sayısı.',
    },
    {
      key: 'http5xx',
      label: '5xx hata oranı',
      value: err?.value ?? '—',
      loading: pulseLoading,
      tone: err?.over ? 'warning' : 'neutral',
      hint: err?.note,
      series: err?.series ?? undefined,
      info: '5xx yanıtların tüm isteklere oranı (son 24 saat). Eşik %5: aşılırsa uyarı.',
    },
    {
      key: 'tenants',
      label: 'Aktif müşteri',
      value: tenants ? nf.format(tenants.active) : '—',
      loading: pulseLoading,
      hint: tenants ? `Toplam ${nf.format(tenants.total)} müşteri` : undefined,
      to: { name: 'tenants' },
    },
    {
      key: 'mrr',
      label: 'MRR · aylık gelir',
      value: mrr ? formatMinor(mrr.minor, mrr.currency) : '—',
      loading: pulseLoading,
      hint: mrr ? `${nf.format(mrr.activeSubscriptions)} ücretli · ${nf.format(mrr.trialing)} denemede` : undefined,
      info: 'Plan liste fiyatından tahmini (MRR); muaf ve özel teklif hariç.',
      to: { name: 'subscriptions', query: { sekme: 'gelir' } },
    },
  ]
})

// ------------------------------------------------------------ nabız
const pulseState = computed<PanelState>(() => (pulse.value === undefined ? (pulseError.value ? 'error' : 'loading') : pulse.value === null ? 'empty' : 'ready'))
const big = computed<{ health: Health; answer: string }>(() => {
  const p = pulse.value
  if (!p) return { health: 'ok', answer: '' }
  const over = p.rows.filter((r) => r.over)
  if (over.length) return { health: 'warning', answer: over.length === 1 ? 'Bir gösterge eşik üstü' : `${over.length} gösterge eşik üstü` }
  return p.degraded.length ? { health: 'unknown', answer: 'Eksik veri' } : { health: 'ok', answer: 'Olağan' }
})
const usageAnswer = computed(() => {
  const t = pulse.value?.usage.tenants
  return t?.state === 'ok' ? `${new Intl.NumberFormat('tr-TR').format(t.active)} aktif müşteri` : ''
})
</script>

<style scoped>
/* BO2-12: satırlar BoTileGrid ile eş yükseklik (DOM/okuma sırası K51: 1-2-3-4). Bölümler kartla ayrık (BO2-11). */
.bo-ov-row > :deep(.bo-ts) {
  height: 100%;
}
</style>
