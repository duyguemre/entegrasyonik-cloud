<!--
  Genel bakış — triyaj panosu (BO-R1, K51; BO_UI_PATTERNS §11). Bilgi yığmaz; dört soruyu SIRAYLA yanıtlar:
  1 sistemde müdahale gereken var mı · 2 büyük resimde kullanım · 3 müşterilerde müdahale gereken var mı · 4 genel kullanım.
  Üstte DURUM (hüküm + sağlık rozeti + önerilen ilk adım), altta katlanır AYRINTI (teknik paneller).
  Veri tek adaptörden (src/api/attention.ts): getAttention + getPulse; uç yoksa getHealth geri düşüşü.
-->
<template>
  <div class="bo-page bo-ov">
    <BoPageHeader :updated-at="checkedAt" :stale="stale">
      <template #meta>
        <span class="bo-inline-note"><v-icon icon="mdi-autorenew" aria-hidden="true" />Sekme açıkken 30 sn'de bir yenilenir</span>
      </template>
      <template #actions>
        <EkButton tone="secondary" icon="mdi-refresh" :loading="loading" data-page-refresh @click="load">Yenile</EkButton>
      </template>
    </BoPageHeader>

    <!-- 1 · DURUM -->
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

    <!-- 2 · KARAR (sistem, müşteri) + sakin büyük resim / kullanım -->
    <div class="bo-ov-grid">
      <BoTriageSection id="sistem" :index="1" question="Sistemde müdahale gereken var mı?" :health="sys.health" :answer="sys.answer" :more="{ label: 'Uyarılar', to: { name: 'alerts' } }">
        <BoAttentionList
          :items="sys.items"
          :limit="narrow ? 2 : 5"
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

      <BoTriageSection id="musteriler" :index="3" question="Müşterilerimde müdahale gereken var mı?" :health="ten.health" :answer="ten.answer" :more="{ label: 'Müşteriler', to: { name: 'tenants' } }">
        <BoAttentionList
          :items="ten.items"
          :total="attention?.total.tenant ?? 0"
          :state="attention?.source === 'fallback' ? 'unsupported' : listState"
          :error="attentionError"
          :retrying="loading"
          :checks="attention?.checks.tenant ?? []"
          :degraded="attention?.degraded.tenant ?? []"
          list-label="Müşterilerde dikkat isteyenler"
          :limit="narrow ? 2 : 4"
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
    </div>

    <!-- 4 · AYRINTI -->
    <BoDetailSection id="teknik" title="Teknik ayrıntılar" summary="Bağımlılıklar ve podlar · kuyruk sayaçları · veri alımı · son yönetim işlemleri" sync-query>
      <TechDetails :tick="tick" />
    </BoDetailSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
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
.bo-ov-grid {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  /* Duvar düzeni, DOM (okuma) sırası 1-2-3-4 korunarak: 1 ve 4 orta satırı paylaşır (esnek), böylece kısa bölümün
     altında boşluk kalmaz — 3 hemen 1'in, 4 hemen 2'nin altından başlar. */
  grid-template-areas: 'sistem buyuk' 'sistem kullanim' 'musteriler kullanim';
  grid-template-rows: auto 1fr auto;
  gap: var(--ek-space-4);
  align-items: start;
}

.bo-ov-grid > #sistem {
  grid-area: sistem;
}

.bo-ov-grid > #buyuk-resim {
  grid-area: buyuk;
}

.bo-ov-grid > #musteriler {
  grid-area: musteriler;
}

.bo-ov-grid > #kullanim {
  grid-area: kullanim;
}

@media (max-width: 1099px) {
  .bo-ov-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'sistem' 'buyuk' 'musteriler' 'kullanim';
    grid-template-rows: none;
  }
}
</style>
