<!--
  frontend/src/components/message/MessageListDashboard.vue

  FE-LOCAL-1046 — Mesajlar sayfasının "Özet" görünümü (Liste | Özet anahtarıyla listenin yerine açılır).
    1) Duruma göre mesajlar — altı durum; TIKLAYINCA listeye dönülür ve liste o duruma süzülür
    2) Durum dağılımı — toplam + oran çubuğu + yüzdeler
  Mesaj için özel istatistik ucu yok: sayılar `MessageService/getMessages` ucundan, her durum için `limit: 1` ile
  istenip backend'in toplam kayıt sayısı okunarak alınır (bkz. `useStatusCounts`). Sayı gelmezse hücre "—" gösterir.
-->
<template>
  <div class="mld">
    <ListDashSection label="Duruma göre mesajlar">
      <ListSummaryStrip :cells="cells" :loading="counts.loading.value" label="Duruma göre mesajlar" @select="(k) => emit('select', k)" />
    </ListDashSection>

    <ListDashSection label="Dağılım">
      <ListDistributionCard title="Mesaj durumları" subtitle="Tüm mesajların durum dağılımı" icon="mdi-message-text-outline" unit="mesaj"
        :rows="distribution" :loading="counts.loading.value" clickable empty-text="Henüz mesaj yok." @select="(k) => emit('select', k)" />
    </ListDashSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { EkTone } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import useRestApi from '@/composables/restapi'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import ListDistributionCard, { type ListDistributionRow } from '@/components/page/ListDistributionCard.vue'
import { totalOf, useStatusCounts } from '@/components/page/useStatusCounts'
import { MessageStatusEnum, MESSAGE_STATUS_LABELS } from '@/types/MessageTypes'

const props = defineProps<{
  /** Listede uygulanmış durum süzmesi (etkin hücre). */
  active: string | null
}>()
const emit = defineEmits<{ select: [status: string] }>()

const restApi = useRestApi()
// Sıra: önce işlem bekleyenler, sonra tamamlananlar.
const STATUSES: MessageStatusEnum[] = [
  MessageStatusEnum.WAITING_SELLER,
  MessageStatusEnum.UNREAD,
  MessageStatusEnum.WAITING_APPROVAL,
  MessageStatusEnum.ANSWERED,
  MessageStatusEnum.READ,
  MessageStatusEnum.REJECTED,
]

const counts = useStatusCounts(STATUSES, async (status) =>
  totalOf(
    await restApi.post('MessageService/getMessages', {
      searchMessageForm: { data: { globalSearch: '', status, type: null, isRejected: null, integrationCodes: [], startDate: null, endDate: null } },
      pagination: { page: 1, limit: 1 },
      sortBy: { key: 'date', order: 'desc' },
    }),
  ),
)

const STYLE: Record<MessageStatusEnum, { icon: string; tone: EkTone; hint: string }> = {
  [MessageStatusEnum.WAITING_SELLER]: { icon: 'mdi-message-alert-outline', tone: 'warning', hint: 'Yanıtınızı bekliyor' },
  [MessageStatusEnum.UNREAD]: { icon: 'mdi-email-outline', tone: 'info', hint: 'Henüz açılmadı' },
  [MessageStatusEnum.WAITING_APPROVAL]: { icon: 'mdi-clock-outline', tone: 'action', hint: 'Kanal onayında' },
  [MessageStatusEnum.ANSWERED]: { icon: 'mdi-check-all', tone: 'success', hint: 'Yanıt gönderildi' },
  [MessageStatusEnum.READ]: { icon: 'mdi-email-open-outline', tone: 'neutral', hint: 'Okundu, işlem yok' },
  [MessageStatusEnum.REJECTED]: { icon: 'mdi-close-circle-outline', tone: 'error', hint: 'Kanal reddetti' },
}

const cells = computed<ListSummaryCell[]>(() =>
  STATUSES.map((s) => {
    const n = counts.counts.value[s]
    return {
      key: s, label: MESSAGE_STATUS_LABELS[s], hint: STYLE[s].hint, icon: STYLE[s].icon, tone: STYLE[s].tone,
      value: n === null ? '—' : formatNumber(n), zero: !n, clickable: true, active: props.active === s,
    }
  }),
)

const distribution = computed<ListDistributionRow[]>(() =>
  STATUSES.map((s) => ({ key: s, label: MESSAGE_STATUS_LABELS[s], count: counts.counts.value[s] ?? 0, tone: STYLE[s].tone })),
)

const refresh = () => counts.load()
onMounted(refresh)
defineExpose({ refresh })
</script>

<style scoped>
.mld {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}
</style>
