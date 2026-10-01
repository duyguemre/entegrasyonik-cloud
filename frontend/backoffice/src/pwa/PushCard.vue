<template>
  <EkCard v-if="cfg?.enabled" title="Kritik uyarılar bu cihazda" subtitle="Yalnız kritik dikkat maddeleri telefona düşer; uyarı düzeyi gelmez." icon="mdi-cellphone-message" data-testid="bo-push-card">
    <div class="bo-push">
      <p v-if="support === 'ios-install'" class="bo-muted" data-testid="bo-push-ios">iPhone/iPad'de bildirim için önce Paylaş → Ana Ekrana Ekle ile paneli kurun, sonra buradan açın.</p>
      <p v-else-if="support === 'ios-unsupported'" class="bo-muted">Bu iOS sürümü anlık bildirimi desteklemiyor (16.4 ve sonrası gerekir).</p>
      <p v-else-if="support === 'unsupported'" class="bo-muted">Bu tarayıcı anlık bildirimi desteklemiyor. Uyarılar panelde ve e-postada görünmeye devam eder.</p>
      <p v-else-if="permission === 'denied' && !native" class="bo-muted" data-testid="bo-push-denied">Bildirim izni reddedilmiş. Tarayıcı ayarlarından bu site için bildirimlere izin verin.</p>
      <div v-else class="bo-push__row">
        <span>{{ thisDevice ? 'Bu cihazda açık.' : 'Bu cihazda kapalı.' }}</span>
        <EkButton v-if="thisDevice" tone="secondary" size="sm" :loading="busy" data-testid="bo-push-disable" @click="onDisable">Bu cihazda kapat</EkButton>
        <EkButton v-else tone="primary" size="sm" icon="mdi-bell-ring-outline" :loading="busy" data-testid="bo-push-enable" @click="onEnable">Bu cihazda aç</EkButton>
      </div>
      <ul v-if="cfg.devices.length" class="bo-push__devices" aria-label="Kayıtlı cihazlarım">
        <li v-for="d in cfg.devices" :key="d.id" class="bo-push__row">
          <span>{{ d.deviceLabel || 'Cihaz' }} <span class="bo-muted">· {{ formatDateTime(d.createdAt) }}</span></span>
          <EkButton tone="ghost" size="sm" icon="mdi-close" :aria-label="`${d.deviceLabel || 'Cihaz'} kaldır`" @click="onRemove(d.id)">Kaldır</EkButton>
        </li>
      </ul>
    </div>
  </EkCard>
</template>

<script setup lang="ts">
// MOB-06: platform yöneticisi web push aboneliği (yalnız kritik dikkat maddeleri). Sunucu kanalı kapalıysa kart hiç görünmez.
// İzin YALNIZ "Bu cihazda aç" tıklamasıyla istenir.
import { onMounted, ref } from 'vue'
import { EkButton, EkCard } from '@entegrasyonik/ui/components'
import type { BoPushConfig } from '@bo/api/contract'
import { formatDateTime } from '@bo/utils/format'
import { notify } from '@bo/utils/toast'
import { isNativeShell } from '@entegrasyonik/ui/native'
import { currentPermission, detectPushSupport, pushUsableHere, useBoWebPush, type PermissionState, type PushSupport } from './webPush'

const push = useBoWebPush()
const cfg = ref<BoPushConfig | null>(null)
const support = ref<PushSupport>('unsupported')
const permission = ref<PermissionState>('default')
const thisDevice = ref(false)
const busy = ref(false)
const native = isNativeShell()

async function refresh() {
  permission.value = currentPermission()
  cfg.value = await push.loadConfig()
  // MOB-07: sunucu kanalı bu cihaz türüne kapalıysa (tarayıcıda VAPID / kabukta FCM yok) "desteklenmiyor".
  support.value = pushUsableHere(cfg.value) ? detectPushSupport() : 'unsupported'
  // Kabukta izin Android ayarındadır; WebView'in Notification.permission'ı anlamsız.
  thisDevice.value = cfg.value?.enabled === true && (isNativeShell() || permission.value === 'granted') && (await push.isSubscribedHere())
}

async function run(action: () => Promise<{ ok: boolean; message?: string }>, done: string) {
  busy.value = true
  try {
    const r = await action()
    if (r.ok) notify('success', done)
    else if (r.message) notify('error', r.message)
    await refresh()
  } finally {
    busy.value = false
  }
}

const onEnable = () => run(() => push.enable(cfg.value?.publicKey ?? null), 'Kritik uyarılar bu cihazda açıldı.')
const onDisable = () => run(() => push.disable(), 'Bu cihazda bildirimler kapatıldı.')
async function onRemove(id: string) {
  if (await push.removeDevice(id)) notify('success', 'Cihaz kaldırıldı.')
  else notify('error', 'Cihaz kaldırılamadı — tekrar deneyin.')
  await refresh()
}

onMounted(refresh)
</script>

<style scoped>
.bo-push {
  display: grid;
  gap: var(--ek-space-3);
}
.bo-push__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
}
.bo-push__devices {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--ek-space-2);
}
</style>
