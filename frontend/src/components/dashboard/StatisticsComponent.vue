<template>
  <div class="stat-card">
    <div class="sc-header">
      <div class="d-flex align-center gap-2">
        <v-icon size="16" color="indigo-accent-2">mdi-chart-timeline-variant</v-icon>
        <span class="sc-title">İŞLETME PERFORMANSI</span>
      </div>
      <v-btn icon size="x-small" variant="text" class="sc-refresh" @click="loadData" :loading="loading"
        aria-label="İşletme performansını yenile">
        <v-icon size="14">mdi-refresh</v-icon>
      </v-btn>
    </div>

    <EkErrorState
      v-if="errorMessage && !loading"
      size="inline"
      :message="errorMessage"
      @retry="loadData"
    />

    <div class="sc-body" v-if="!loading">

      <EkKpiRow class="premium-stats-wrapper">
        <EkKpiCard
          label="Toplam Sipariş"
          :value="fmt(d.totals.orderCount)"
          :secondary-value="fmtMoney(d.totals.revenue)"
        />
        <EkKpiCard
          label="İade / Talep"
          :value="fmt(d.totals.returnCount)"
          :secondary-value="fmtMoney(d.totals.returnAmount)"
        />
        <EkKpiCard
          label="Bugün Sipariş"
          :value="fmt(d.today.count)"
          :secondary-value="fmtMoney(d.today.revenue)"
          :change="d.trend.countChange"
          :change-direction="d.trend.countChange < 0 ? 'down' : 'up'"
        />
      </EkKpiRow>

      <divider-component />

      <div class="pending-section">
        <div class="c-label text-center">BEKLEYEN AKSİYONLAR</div>
        <v-chart v-if="isMounted" class="chart pending-chart-size" theme="entegrasyonik" :option="pendingChartOption"
          autoresize @click="onChartClick" />

      </div>



    </div>

    <div class="sc-skeleton" v-else>
      <EkSkeleton type="cards" :rows="3" />
    </div>

  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, onBeforeUnmount, inject } from 'vue'
import useRestApi from '@/composables/restapi'
import { Emitter } from 'mitt'
import { useMenuStore } from '@/stores/site/menu'
import { semanticColorsLight } from '@/design/tokens'
import { generateSupportCode } from '@/composables/logger'
import { formatNumber, formatMoney } from '@/composables/format'
import EkKpiRow from '@/components/ds/EkKpiRow.vue'
import EkKpiCard from '@/components/ds/EkKpiCard.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'

const restApi = useRestApi()
const menuStore = useMenuStore()
const eventBus = inject('eventBus') as Emitter<any>
const loading = ref(false)
const isMounted = ref(false)


const openEditProduct = (product?: any) => {
  let link: any = menuStore.getMenuLinkWithTitle('orderList')
  if (product)
    link.parameters = { productId: product._id }

  const clonedLink = JSON.parse(JSON.stringify(link))
  clonedLink.component = menuStore.getViewComponent(link.code)
  clonedLink.code = link.code + '_' + product._id
  clonedLink.title = product.title

  eventBus.emit('openTab', clonedLink)
}




const onChartClick = (params: any) => {
  const dataIndex = params.dataIndex; // 0: Fatura, 1: Kargo, 2: İade, 3: Soru


  let link = undefined
  if (dataIndex === 0) {
    // Fatura
    link = menuStore.getMenuLinkWithTitle('orderList');
    link.parameters = { internalStatuses: ['APPROVED'] }
  } else if (dataIndex === 1) {
    // Kargo
    link = menuStore.getMenuLinkWithCode('OrderListView');
    link.parameters = { internalStatuses: ['APPROVED'] }
  } else if (dataIndex === 2) {
    // İade
    link = menuStore.getMenuLinkWithCode('ClaimListView');
    link.parameters = { internalStatuses: ['WAITING', 'DELIVERED', 'SHIPPED'] }
  } else if (dataIndex === 3) {
    // Soru
    link = menuStore.getMenuLinkWithCode('MessageListView');
    link.parameters = { status: 'WAITING_SELLER' }
  }

  if (link)
    eventBus.emit('openTab', link)

};



// Eğer Echarts importlarınız eksikse şunları projenize göre eklemelisiniz:
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { LegacyGridContainLabel } from 'echarts/features';
import VChart from 'vue-echarts';
import DividerComponent from '../layout/DividerComponent.vue';
import { buildChartCategoricalPalette } from '@/design/echarts-theme';
use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, LegacyGridContainLabel]);

// ADR-0015 Karar 3.6 (A5) — grafik artık `entegrasyonik` temasına bağlı
// (`theme="entegrasyonik"`, `main.ts`'te kaydedilir). Eksen/ızgara/tooltip
// stili ve animasyon kısıtları (≤250ms, overshoot yok) temadan gelir; burada
// yalnızca kategoriye özgü veri ve çubuk dolgu rengi (kategorik palet, token
// kaynaklı — hardcoded hex/degrade YOK) kalır. Önceki geçersiz hex
// (`#7483b98`, 7 haneli typo) ve gölge/degrade süslemesi bu bilinçli
// yenilemeyle KALDIRILDI (Karar 1.1: "gölge/degrade yok").
const categoricalPalette = buildChartCategoricalPalette(
  semanticColorsLight.primary,
  semanticColorsLight['secondary-darken-1'],
);

const pendingChartOption = computed(() => {
  const categories = ['Fatura', 'Kargo', 'İade', 'Soru'];
  const values = [
    d.value.pending.invoiceCount || 0,
    d.value.pending.shippingCount || 0,
    d.value.pending.claimCount || 0,
    d.value.pending.messageCount || 0
  ];

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'none' } },
    grid: { top: '15%', left: '2%', right: '2%', bottom: '0%', containLabel: true },
    xAxis: { type: 'category', data: categories },
    yAxis: { type: 'value' },
    series: [
      {
        name: 'Bekleyen',
        type: 'bar',
        barWidth: '35%',
        data: values.map((val, idx) => ({
          value: val,
          itemStyle: {
            color: categoricalPalette[idx % categoricalPalette.length],
            borderRadius: [4, 4, 0, 0],
          },
        })),
        label: {
          show: true,
          position: 'top',
          color: semanticColorsLight['content-strong'],
          fontWeight: 'bold',
          fontSize: 12
        }
      }
    ]
  };
});

const mkDefault = () => ({
  totals: { orderCount: 0, revenue: 0, returnCount: 0, returnAmount: 0 },
  today: { count: 0, revenue: 0 },
  trend: { countChange: 0, revenueChange: 0 },
  statusDistribution: { UNAPPROVED: 0, AWAITING_APPROVAL: 0, APPROVED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0, RETURNED: 0, total: 0 },
  pending: { invoiceCount: 0, shippingCount: 0, claimCount: 0, messageCount: 0 },
  last7Days: Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - (6 - i))
    return { date: dt.toISOString().slice(0, 10), count: 0, revenue: 0 }
  })
})

const d = ref(mkDefault())
// ADR-0015 Karar 3.2 (A5) — "hata ile boş ayrı gösterilir". Önceki sürüm
// hatayı yalnızca console'a basıp KULLANICIYA HİÇBİR şey göstermiyordu
// (PLATFORM_BASELINE A2 "sessiz yutma yok" ihlali). `dashboard.spec.ts`
// "hata durumu" testi yalnızca "500"/"Error" metninin SIZMADIĞINI ve
// KPI'ların sıfır kalabildiğini doğruluyor — bu insan-okunur, destek kodlu
// bildirim o iddiaları KIRMAZ (ham hata/HTTP kodu YOK, `EkErrorState` skill
// sözleşmesi).
const errorMessage = ref<string | null>(null)

// `restApi.post` GİZLİ DAVRANIŞ (karakterizasyon, `restapi.ts` `postService`):
// ağ/HTTP hatasında promise REDDETMEZ, ham axios hata nesnesini "başarılı"
// değer olarak `resolve` eder (bkz. `SubscriptionView.vue` aynı `res?.response?.status`
// deseni). Bu yüzden hata algılama `catch` YERİNE dönen gövdenin BEKLENEN
// alanı (`totals`) taşıyıp taşımadığına bakar; `try/catch` yalnızca beklenmedik
// (senkron) hatalar için güvenlik ağıdır.
const isErrorShapedResponse = (res: any) => Boolean(res?.isAxiosError || res?.response?.status)

const loadData = async () => {
  if (!isMounted.value) return
  loading.value = true
  errorMessage.value = null
  try {
    const res = await restApi.post('OrderService/getOrderDashboardInsights', {})
    if (!isMounted.value) return
    if (res?.totals !== undefined) {
      d.value = res
    } else if (isErrorShapedResponse(res)) {
      // Teknik ayrıntı `restApi.post` içinde zaten `logger.error` ile loglanır
      // (request id dahil) — burada yalnızca kullanıcıya eyleme dönük mesaj +
      // destek kodu üretilir (ham hata/HTTP kodu GÖSTERİLMEZ).
      errorMessage.value = `İşletme performansı verileri şu anda yüklenemiyor — tekrar deneyin. (Destek kodu: ${generateSupportCode()})`
    }
  } catch (e) {
    if (!isMounted.value) return
    errorMessage.value = `İşletme performansı verileri şu anda yüklenemiyor — tekrar deneyin. (Destek kodu: ${generateSupportCode()})`
  }
  finally {
    if (!isMounted.value) return
    loading.value = false
  }
}

onMounted(() => {
  isMounted.value = true
  loadData()
})

onBeforeUnmount(() => {
  isMounted.value = false
})

// helpers — ADR-0015 Karar 6.3 (tek biçimlendirici), `dashboard.spec.ts`
// yalnızca ham SAYIYI ("12") çapalar, biçimli para/yüzde metnini DEĞİL —
// bu yüzden `formatMoney`'e geçiş spec'i KIRMAZ.
const fmt = (v: number) => formatNumber(v ?? 0)
const fmtMoney = (v: number) => formatMoney(v ?? 0)
</script>

<style scoped>
.stat-card {
  background: var(--ek-color-surface);
  border-radius: 10px;
  border: 1px solid rgb(var(--v-theme-borderColorLight));
}

/* ── HEADER ── */
.sc-header {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--ek-color-surface-muted);
}

.sc-title {
  font-size: 11px;
  font-weight: 800;
  color: var(--ek-color-content-muted) !important;
  letter-spacing: 1px;
}

.sc-refresh {
  color: var(--ek-color-border-strong);
}

.sc-refresh:hover {
  color: var(--ek-color-primary);
}

/* ── BEKLEYEN İŞLEMLER ── */
.pending-section {
  padding: 0px 18px;
  padding-bottom: 12px
}

/* ── KPI SATIRI (EkKpiRow) ── kenar boşluğu yalnızca yerleşim, EkKpiRow'un
   kendi grid/gap kuralı KORUNUR (display üzerine YAZILMAZ). */
.premium-stats-wrapper {
  padding: 0px 18px;
}

.c-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ek-color-content-muted);
  letter-spacing: .1px;
  text-transform: uppercase;
}

.chart {
  height: 100%;
  width: 100%;
}

.pending-chart-size {
  max-height: 214px;
  min-height: 272.5px;
  width: 100%;
}
</style>
