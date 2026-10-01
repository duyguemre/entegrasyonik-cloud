<!--
  MOB-04 — "Bu cihazda anlık bildirimler" (Ayarlar > Bildirim tercihleri). Ekran kanal açıkken ve masaüstü kabuğu
  dışında gösterir (Electron'da gizli). İzin YALNIZ "Bu cihazda aç" tıklamasıyla istenir.
  Durumlar: açık · kapalı · izin reddedildi · iOS'ta önce ana ekrana ekle (16.4+) · iOS sürümü eski · tarayıcı desteklemiyor.
  Kayıtlı cihazlar: kullanıcının kendi cihazları; "Kaldır" o cihazın aboneliğini siler.
-->
<template>
  <section class="ek-push" aria-labelledby="np-push-title" data-push-card :data-state="view">
    <header class="ek-push__intro">
      <h2 id="np-push-title" class="ek-push__title">Bu cihazda anlık bildirimler</h2>
      <p class="ek-push__desc">
        Seçtiğiniz kategorilerdeki bildirimler telefonunuza ya da tarayıcınıza anında düşer. Bildirimde yalnızca kısa bir başlık görünür;
        sipariş, müşteri ya da ürün ayrıntısı kilit ekranında gösterilmez — dokununca ilgili ekran açılır.
      </p>
    </header>

    <EkAlert v-if="message" :tone="messageTone" :text="message" live dense />

    <div v-if="view === 'ios-install'" class="ek-push__state">
      <EkAlert tone="info" title="iPhone ve iPad'de önce ana ekrana ekleyin">
        Apple, anlık bildirimleri yalnızca ana ekrana eklenmiş uygulamalara izin verir (iOS / iPadOS 16.4 ve üstü).
        Safari'de <strong>Paylaş</strong> → <strong>Ana Ekrana Ekle</strong> adımlarını izleyin, ardından Entegrasyonik'i ana ekrandaki
        simgeden açıp buradan bildirimleri açın.
      </EkAlert>
    </div>
    <div v-else-if="view === 'ios-unsupported'" class="ek-push__state">
      <EkAlert tone="warning" title="iOS sürümünüz anlık bildirimi desteklemiyor"
        text="Ana ekrana eklenmiş uygulamada anlık bildirim için iOS / iPadOS 16.4 veya üstü gerekir. Cihazınızı güncelledikten sonra tekrar deneyin." />
    </div>
    <div v-else-if="view === 'unsupported'" class="ek-push__state">
      <EkAlert tone="info" title="Bu tarayıcı anlık bildirim desteklemiyor"
        text="Uygulama içi bildirimler ve e-posta çalışmaya devam eder. Chrome, Edge, Firefox ya da Safari'nin güncel bir sürümünü kullanabilirsiniz." />
    </div>
    <div v-else-if="view === 'denied'" class="ek-push__state">
      <EkAlert tone="warning" title="Bildirim izni kapalı"
        text="Bu site için bildirim izni reddedilmiş. Tarayıcının adres çubuğundaki site ayarlarından (ya da telefonun Ayarlar > Bildirimler bölümünden) Entegrasyonik'e izin verip bu sayfayı yenileyin." />
    </div>
    <div v-else class="ek-push__row">
      <div class="ek-push__status">
        <EkStatusChip :tone="view === 'on' ? 'success' : 'neutral'" :label="view === 'on' ? 'Bu cihazda açık' : 'Bu cihazda kapalı'" />
        <span class="ek-push__hint">{{ view === 'on' ? 'Kategorilerdeki “Telefon” seçimine göre bildirim gelir.' : 'Açtığınızda tarayıcı sizden izin isteyecek.' }}</span>
      </div>
      <EkButton v-if="view === 'on'" tone="secondary" size="sm" icon="mdi-bell-off-outline" :loading="busy" data-push-disable @click="disable">
        Bu cihazda kapat
      </EkButton>
      <EkButton v-else tone="primary" size="sm" icon="mdi-bell-ring-outline" :loading="busy" data-push-enable @click="enable">
        Bu cihazda aç
      </EkButton>
    </div>

    <div v-if="devices.length" class="ek-push__devices">
      <h3 class="ek-push__subtitle">Kayıtlı cihazlarınız</h3>
      <ul class="ek-push__list">
        <li v-for="d in devices" :key="d.id" class="ek-push__device" data-push-device>
          <v-icon icon="mdi-cellphone-message" aria-hidden="true" />
          <span class="ek-push__device-name">{{ d.deviceLabel || 'Adsız cihaz' }}</span>
          <span class="ek-push__device-meta">Eklendi <EkRelativeTime :value="d.createdAt" /></span>
          <EkButton tone="danger-quiet" size="sm" :aria-label="`${d.deviceLabel || 'Adsız cihaz'} cihazını kaldır`" :loading="removing === d.id"
            @click="remove(d.id)">
            Kaldır
          </EkButton>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { EkAlert, EkButton, EkRelativeTime, EkStatusChip } from '@entegrasyonik/ui/components'
import { currentPermission, detectPushSupport, useWebPush, type PermissionState, type PushConfig, type PushSupport } from '@/pwa/webPush'

const props = defineProps<{ config: PushConfig }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const push = useWebPush()
const support = ref<PushSupport>(detectPushSupport())
const permission = ref<PermissionState>(currentPermission())
const subscribed = ref(false)
const busy = ref(false)
const removing = ref<string | null>(null)
const message = ref('')
const messageTone = ref<'success' | 'error'>('success')

const devices = computed(() => props.config.devices)
const view = computed(() => {
  if (support.value !== 'supported') return support.value
  if (permission.value === 'denied') return 'denied'
  return subscribed.value && permission.value === 'granted' ? 'on' : 'off'
})

async function refreshLocal() {
  subscribed.value = !!(await push.currentSubscription())
  permission.value = currentPermission()
}

async function enable() {
  if (!props.config.publicKey) return
  busy.value = true
  message.value = ''
  const r = await push.enablePush(props.config.publicKey)
  busy.value = false
  await refreshLocal()
  if (r.ok) {
    messageTone.value = 'success'
    message.value = 'Bu cihazda anlık bildirimler açıldı.'
    emit('changed')
  } else if (r.reason !== 'denied') {
    messageTone.value = 'error'
    message.value = r.message
  }
}

async function disable() {
  busy.value = true
  message.value = ''
  const r = await push.disablePush()
  busy.value = false
  await refreshLocal()
  messageTone.value = r.ok ? 'success' : 'error'
  message.value = r.ok ? 'Bu cihazda anlık bildirimler kapatıldı.' : r.message
  if (r.ok) emit('changed')
}

async function remove(id: string) {
  removing.value = id
  const ok = await push.removeDevice(id)
  removing.value = null
  messageTone.value = ok ? 'success' : 'error'
  message.value = ok ? 'Cihaz kaldırıldı.' : 'Cihaz kaldırılamadı — tekrar deneyin.'
  if (ok) {
    await refreshLocal()
    emit('changed')
  }
}

onMounted(refreshLocal)
</script>

<style scoped>
.ek-push {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-8) 0;
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ek-push__intro {
  max-width: 640px;
}

.ek-push__title {
  margin: 0 0 var(--ek-space-1);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.ek-push__desc,
.ek-push__hint,
.ek-push__device-meta {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-push__hint,
.ek-push__device-meta {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-push__state {
  max-width: 720px;
}

.ek-push__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  max-width: 720px;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-push__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-push__subtitle {
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ek-push__list {
  display: flex;
  flex-direction: column;
  max-width: 720px;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-push__device {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 44px;
  padding: var(--ek-space-2) var(--ek-space-4);
}

.ek-push__device + .ek-push__device {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-push__device :deep(.v-icon) {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.ek-push__device-name {
  overflow: hidden;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 559px) {
  .ek-push__device {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .ek-push__device-meta {
    display: none;
  }
}
</style>
