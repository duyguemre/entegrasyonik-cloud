<template>
  <div class="bo-page">
    <nav class="bo-crumbs" aria-label="Konum">
      <RouterLink to="/musteriler">Müşteriler</RouterLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{{ client?.title ?? `#${tid}` }}</span>
    </nav>

    <EkEmptyState v-if="notFound" variant="no-results" title="Müşteri bulunamadı" :message="`#${tid} numaralı kayıt yok ya da kaldırılmış.`" />
    <template v-else>
      <div class="bo-page__head">
        <div class="bo-tenant__title">
          <h1 class="bo-page__title">{{ client?.title ?? '…' }}</h1>
          <div class="bo-tenant__chips">
            <span class="bo-tenant__tid ek-num">#{{ tid }}</span>
            <EkStatusChip v-if="lifecycle" :tone="LIFECYCLE[lifecycle.status].tone" :label="LIFECYCLE[lifecycle.status].label" dot />
            <EkStatusChip v-if="lifecycle" tone="info" :label="`Plan: ${PLAN[lifecycle.planCode]}`" />
          </div>
        </div>
        <div class="bo-page__actions">
          <EkButton tone="primary" icon="mdi-account-switch-outline" :disabled="!client" data-testid="impersonate" @click="openImpersonation">Hesaba geçici erişim</EkButton>
        </div>
      </div>

      <div class="bo-grid bo-tenant__grid">
        <EkCard title="Hesap" icon="mdi-storefront-outline">
          <EkDescriptionList v-if="client && lifecycle" :items="accountItems" />
          <EkSkeleton v-else type="detail" :rows="3" />
        </EkCard>

        <EkCard title="Kullanım" subtitle="Yalnız sayılar — iş verisi gösterilmez" icon="mdi-chart-box-outline" icon-tone="info">
          <div v-if="lifecycle" class="bo-tenant__usage">
            <div><strong class="ek-num">{{ formatNumber(lifecycle.usage.users) }}</strong><span>kullanıcı</span></div>
            <div><strong class="ek-num">{{ formatNumber(lifecycle.usage.products) }}</strong><span>ürün</span></div>
            <div><strong class="ek-num">{{ formatNumber(lifecycle.usage.ordersLast30d) }}</strong><span>sipariş (30 gün)</span></div>
          </div>
          <EkSkeleton v-else type="cards" :rows="1" />
        </EkCard>

        <EkCard title="Kanallar" icon="mdi-transit-connection-variant">
          <ul v-if="client?.integrations?.length" class="bo-tenant__channels">
            <li v-for="i in client.integrations" :key="i.integrationCode">
              <EkChannelDot :code="i.integrationCode" :name="CHANNEL[i.integrationCode] ?? i.integrationCode" variant="plain" />
              <span class="bo-muted">{{ i.type }}</span>
            </li>
          </ul>
          <p v-else-if="client" class="bo-muted">Bağlı kanal yok.</p>
          <EkSkeleton v-else type="detail" :rows="2" />
        </EkCard>

        <EkCard title="Kurulum adımları" icon="mdi-format-list-checks">
          <ol v-if="lifecycle" class="bo-tenant__steps">
            <li v-for="s in lifecycle.provisioning" :key="s.step" :class="`is-${s.status}`">
              <v-icon :icon="s.status === 'done' ? 'mdi-check-circle' : s.status === 'failed' ? 'mdi-close-circle' : 'mdi-clock-outline'" aria-hidden="true" />
              <span>{{ s.step }}</span>
              <span class="bo-muted">{{ s.status === 'failed' ? 'başarısız' : s.status === 'pending' ? 'bekliyor' : 'tamam' }}</span>
            </li>
          </ol>
          <EkSkeleton v-else type="detail" :rows="3" />
        </EkCard>
      </div>
      <p class="bo-muted bo-tenant__src">Kaynak: AdminService/getClients · BackofficeTenantService/getLifecycle (planlanan uç, B2 — hassas okuma olarak denetime yazılır)</p>
    </template>

    <EkDialog
      v-model="impOpen"
      title="Hesaba geçici erişim"
      :description="`${client?.title ?? ''} hesabı yeni sekmede, yönetici olarak açılır.`"
      icon="mdi-account-switch-outline"
      width="md"
      as-form
      confirm-label="Gerekçeyle başlat"
      confirm-icon="mdi-open-in-new"
      :confirm-loading="impBusy"
      :confirm-disabled="reason.trim().length < 10"
      @confirm="startImpersonation"
    >
      <div class="bo-imp">
        <ul class="bo-imp__rules">
          <li><v-icon icon="mdi-timer-outline" aria-hidden="true" />Bağlantı 60 saniye içinde, bir kez kullanılabilir; oturum 60 dakika sürer ve uzatılmaz.</li>
          <li><v-icon icon="mdi-cancel" aria-hidden="true" />Silme, ödeme ve kullanıcı yönetimi işlemleri bu oturumda kapalıdır.</li>
          <li><v-icon icon="mdi-clipboard-text-outline" aria-hidden="true" />Başlatma ve oturumdaki her yazma işlemi gerekçeyle denetime yazılır.</li>
        </ul>
        <v-textarea
          v-model="reason"
          label="Gerekçe"
          placeholder="ör. Destek talebi: sipariş eşleme ekranında hata"
          rows="3"
          auto-grow
          counter
          :hint="reason.trim().length < 10 ? `En az 10 karakter (${reason.trim().length}/10)` : 'Denetim kaydına bu metin yazılır.'"
          persistent-hint
          :error-messages="impError || undefined"
          autofocus
        />
      </div>
    </EkDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  EkButton,
  EkCard,
  EkChannelDot,
  EkDescriptionList,
  EkDialog,
  EkEmptyState,
  EkSkeleton,
  EkStatusChip,
} from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { AdminApiError } from '@bo/api/client'
import type { ClientDto, TenantLifecycle } from '@bo/api/contract'
import { CHANNEL, LIFECYCLE, PLAN } from '@bo/utils/labels'
import { formatDate, formatDateTime, formatNumber, formatRelative } from '@bo/utils/format'
import { notify } from '@bo/utils/toast'

const route = useRoute()
const tid = Number(route.params.tid)
const client = ref<ClientDto | null>(null)
const lifecycle = ref<TenantLifecycle | null>(null)
const notFound = ref(false)

onMounted(async () => {
  const [list, life] = await Promise.allSettled([
    api.call('AdminService/getClients', { search: String(tid), limit: 50 }),
    api.call('BackofficeTenantService/getLifecycle', { tid }),
  ])
  client.value = list.status === 'fulfilled' ? (list.value.clients.find((c) => c.clientId === tid) ?? null) : null
  lifecycle.value = life.status === 'fulfilled' ? life.value : null
  notFound.value = !client.value
})

const accountItems = computed(() => {
  const c = client.value!
  const l = lifecycle.value!
  return [
    { label: 'Mağaza numarası (tid)', value: `#${c.clientId}` },
    { label: 'Yaşam döngüsü', value: LIFECYCLE[l.status].label },
    { label: 'Plan', value: PLAN[l.planCode] },
    { label: 'Deneme bitişi', value: l.trialEndsAt ? formatDate(l.trialEndsAt) : '—' },
    { label: 'Silme tarihi', value: l.deletionScheduledAt ? formatDate(l.deletionScheduledAt) : '—' },
    { label: 'Kayıt', value: formatDate(c.createdAt) },
    { label: 'Son etkinlik', value: l.lastActivityAt ? formatRelative(l.lastActivityAt) : '—' },
    { label: 'Son sipariş eşitleme', value: c.lastSuccessfulOrderSync ? formatDateTime(c.lastSuccessfulOrderSync) : '—' },
  ]
})

const impOpen = ref(false)
const impBusy = ref(false)
const impError = ref('')
const reason = ref('')

function openImpersonation() {
  reason.value = ''
  impError.value = ''
  impOpen.value = true
}

async function startImpersonation() {
  if (impBusy.value || reason.value.trim().length < 10) return
  impBusy.value = true
  impError.value = ''
  try {
    // Step-up (REAUTH_REQUIRED) istemcide yakalanır: diyalog açılır, doğrulanınca istek yenilenir.
    const { url } = await api.call('BackofficeTenantService/startImpersonation', { tid, reason: reason.value.trim() })
    // Bilet URL'i yalnız yeni sekmeye verilir: saklanmaz, loglanmaz; noopener/noreferrer ile opener ve Referer yok.
    window.open(url, '_blank', 'noopener,noreferrer')
    impOpen.value = false
    notify('success', 'Müşteri hesabı yeni sekmede açıldı. Oturum 60 dakika sürer.')
  } catch (e) {
    const err = e instanceof AdminApiError ? e : null
    if (err?.cancelled) impError.value = 'Yeniden doğrulama yapılmadığı için erişim başlatılmadı.'
    else if (err?.code === 'VALIDATION') impError.value = 'Gerekçe en az 10 karakter olmalı.'
    else impError.value = err?.message ?? 'Erişim başlatılamadı.'
  } finally {
    impBusy.value = false
  }
}
</script>

<style scoped>
.bo-crumbs {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-type-label-size);
}

.bo-crumbs a {
  color: var(--ek-color-content-muted);
  text-decoration: none;
}

.bo-crumbs a:hover {
  color: var(--ek-color-content-strong);
  text-decoration: underline;
}

.bo-crumbs [aria-current] {
  color: var(--ek-color-content-default);
}

.bo-tenant__title {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.bo-tenant__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

.bo-tenant__tid {
  color: var(--ek-color-content-muted);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-label-size);
}

.bo-tenant__grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
}

.bo-tenant__usage {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ek-space-3);
}

.bo-tenant__usage div {
  display: flex;
  flex-direction: column;
  padding: var(--ek-space-3);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface-muted);
}

.bo-tenant__usage strong {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-tenant__usage span {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-tenant__channels,
.bo-tenant__steps {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-tenant__channels li,
.bo-tenant__steps li {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  font-size: var(--ek-type-body-size);
}

.bo-tenant__channels li .bo-muted,
.bo-tenant__steps li .bo-muted {
  margin-left: auto;
  font-size: var(--ek-type-caption-size);
}

.bo-tenant__steps .is-done :deep(.v-icon) {
  color: var(--ek-color-success);
}

.bo-tenant__steps .is-failed :deep(.v-icon) {
  color: var(--ek-color-error);
}

.bo-tenant__steps .is-pending :deep(.v-icon) {
  color: var(--ek-color-content-subtle);
}

.bo-tenant__src {
  margin: 0;
  font-size: var(--ek-type-caption-size);
}

.bo-imp {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.bo-imp__rules {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-warning-border);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-label-size);
  list-style: none;
}

.bo-imp__rules li {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
}

.bo-imp__rules :deep(.v-icon) {
  margin-top: 1px;
  font-size: var(--ek-icon-sm);
}

@media (max-width: 1023px) {
  .bo-tenant__grid {
    grid-template-columns: 1fr;
  }
}
</style>
