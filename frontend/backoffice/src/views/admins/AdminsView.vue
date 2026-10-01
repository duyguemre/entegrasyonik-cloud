<template>
  <div class="bo-page">
    <BoPageHeader>
      <template #actions>
        <EkRefreshButton :loading="res.refreshing.value || res.phase.value === 'loading'" @refresh="res.load()" />
        <EkButton tone="primary" icon="mdi-account-plus-outline" data-testid="invite" @click="openInvite">Davet et</EkButton>
      </template>
    </BoPageHeader>

    <EkCard flush>
      <StateBlock :phase="phase" :error="res.error.value" :rows="4" empty-title="Yönetici yok" empty-message="Listelenecek platform yöneticisi bulunamadı." error-title="Yönetici listesi yüklenemedi" degraded-title="Yönetici servisi şu an kullanılamıyor" @retry="res.load()">
        <EkDataTable :items="rows" :columns="COLUMNS" row-key="sub">
          <template #cell-name="{ item }">
            <span class="bo-cell-stack">
              <span class="bo-admin__name">{{ full(item as PlatformAdmin) }} <EkStatusChip v-if="isSelf(item as PlatformAdmin)" tone="info" label="Siz" /></span>
              <span class="ek-num">{{ (item as PlatformAdmin).email }}</span>
            </span>
          </template>
          <template #cell-status="{ item }">
            <span class="bo-admin__flags">
              <EkStatusChip :tone="STATUS[(item as PlatformAdmin).status].tone" :label="STATUS[(item as PlatformAdmin).status].label" dot />
              <EkStatusChip v-if="(item as PlatformAdmin).locked" tone="danger" icon="mdi-lock-outline" label="Kilitli" />
            </span>
          </template>
          <template #cell-mfaEnabled="{ item }">
            <EkStatusChip v-if="(item as PlatformAdmin).status === 'invited'" tone="neutral" label="—" />
            <EkStatusChip v-else :tone="(item as PlatformAdmin).mfaEnabled ? 'success' : 'warning'" :label="(item as PlatformAdmin).mfaEnabled ? '2FA açık' : '2FA kurulmadı'" />
          </template>
          <template #cell-lastLoginAt="{ item }">
            <span v-if="(item as PlatformAdmin).lastLoginAt" class="bo-cell-stack"><span>{{ formatRelative((item as PlatformAdmin).lastLoginAt ?? undefined) }}</span><span class="ek-num">{{ formatDateTime((item as PlatformAdmin).lastLoginAt ?? '') }}</span></span>
            <span v-else class="bo-muted">hiç</span>
          </template>
          <template #cell-createdAt="{ item }">{{ formatDate((item as PlatformAdmin).createdAt) }}</template>
          <template #cell-actions="{ item }">
            <span class="bo-row-actions">
              <template v-if="!isSelf(item as PlatformAdmin)">
                <EkButton v-if="(item as PlatformAdmin).status === 'disabled'" size="sm" tone="secondary" icon="mdi-account-check-outline" :aria-label="`${full(item as PlatformAdmin)} etkinleştir`" data-testid="enable" @click="enable.open(item as PlatformAdmin)">Etkinleştir</EkButton>
                <EkButton v-if="(item as PlatformAdmin).status === 'active'" size="sm" tone="secondary" icon="mdi-account-cancel-outline" :aria-label="`${full(item as PlatformAdmin)} devre dışı bırak`" data-testid="disable" @click="disable.open(item as PlatformAdmin)">Devre dışı bırak</EkButton>
                <EkButton v-if="(item as PlatformAdmin).status === 'invited'" size="sm" tone="secondary" icon="mdi-email-remove-outline" :aria-label="`${(item as PlatformAdmin).email} davetini iptal et`" data-testid="revoke" @click="disable.open(item as PlatformAdmin)">Daveti iptal et</EkButton>
                <EkButton v-if="(item as PlatformAdmin).status !== 'invited'" size="sm" tone="ghost" icon="mdi-shield-refresh-outline" :aria-label="`${full(item as PlatformAdmin)} iki adımlı doğrulamayı sıfırla`" data-testid="reset-mfa" @click="resetMfa.open(item as PlatformAdmin)">2FA sıfırla</EkButton>
              </template>
            </span>
          </template>
        </EkDataTable>
      </StateBlock>
    </EkCard>

    <GuardedDialog
      :action="invite"
      title="Yönetici davet et"
      description="Davet bağlantısı e-posta ile gider, 48 saat geçerlidir ve bir kez kullanılır."
      :items="['Davet edilen kişi ad ve parolasını belirler; ilk girişte iki adımlı doğrulama kurulumu zorunludur.', 'Mevcut bir müşteri ya da yönetici e-postasına yetki verilmez; ayrı bir e-posta gerekir.', 'Aynı adrese yeniden davet, bekleyen daveti yeniler ve eski bağlantıyı geçersiz kılar.']"
      confirm-label="Davet gönder"
      confirm-icon="mdi-email-fast-outline"
      :confirm-disabled="!emailValid"
    >
      <v-text-field v-model="inviteEmail" label="E-posta" type="email" autocomplete="off" density="compact" maxlength="254" :error-messages="inviteEmail && !emailValid ? 'Geçerli bir e-posta adresi girin.' : undefined" hide-details="auto" data-testid="invite-email" />
    </GuardedDialog>

    <GuardedDialog
      :action="disable"
      :title="disable.context.value?.status === 'invited' ? 'Davet iptal edilsin mi?' : 'Yönetici devre dışı bırakılsın mı?'"
      :description="disable.context.value ? `${full(disable.context.value)} · ${disable.context.value.email}` : ''"
      :items="disableItems"
      :confirm-label="disable.context.value?.status === 'invited' ? 'Daveti iptal et' : 'Devre dışı bırak'"
      confirm-icon="mdi-account-cancel-outline"
      danger
    />
    <GuardedDialog
      :action="enable"
      title="Yönetici etkinleştirilsin mi?"
      :description="enable.context.value ? `${full(enable.context.value)} · ${enable.context.value.email}` : ''"
      :items="['Hesap yeniden giriş yapabilir.', 'Parola kilidi ve hatalı deneme sayacı temizlenir.', 'Hesabın eski oturumları geçersiz kalır; yeniden giriş gerekir.']"
      confirm-label="Etkinleştir"
      confirm-icon="mdi-account-check-outline"
    />
    <GuardedDialog
      :action="resetMfa"
      title="İki adımlı doğrulama sıfırlansın mı?"
      :description="resetMfa.context.value ? `${full(resetMfa.context.value)} · ${resetMfa.context.value.email}` : ''"
      :items="['Mevcut doğrulayıcı kaydı ve kurtarma kodları silinir.', 'Yöneticinin tüm oturumları anında kapanır.', 'Sonraki girişte iki adımlı doğrulama yeniden kurulur.']"
      confirm-label="2FA sıfırla"
      confirm-icon="mdi-shield-refresh-outline"
      danger
    />
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import { computed, onMounted, ref } from 'vue'
import { EkButton, EkCard, EkDataTable, EkRefreshButton, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { AdminStatus, PlatformAdmin } from '@bo/api/contract'
import { session } from '@bo/auth/session'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import { formatDate, formatDateTime, formatRelative } from '@bo/utils/format'
import { notify } from '@bo/utils/toast'
import { remapError } from '../settings/remapError'
import '@bo/styles/kit.css'

const COLUMNS: EkTableColumn[] = [
  { key: 'name', label: 'Yönetici' },
  { key: 'status', label: 'Durum' },
  { key: 'mfaEnabled', label: 'İki adımlı doğrulama' },
  { key: 'lastLoginAt', label: 'Son giriş' },
  { key: 'createdAt', label: 'Oluşturma' },
  { key: 'actions', label: '', type: 'actions' },
]
const STATUS: Record<AdminStatus, { tone: 'success' | 'neutral' | 'info'; label: string }> = {
  active: { tone: 'success', label: 'Etkin' },
  disabled: { tone: 'neutral', label: 'Devre dışı' },
  invited: { tone: 'info', label: 'Davet bekliyor' },
}

const res = useResource(() => api.call('BackofficeAdminUserService/list', {}))
const items = computed(() => res.data.value?.items ?? [])
const rows = computed(() => items.value as unknown as Array<Record<string, unknown>>)
const phase = computed(() => (res.phase.value === 'ready' && !items.value.length ? 'empty' : res.phase.value))
const full = (a: PlatformAdmin) => (a.status === 'invited' ? 'Davet bekliyor' : `${a.name} ${a.surname}`.trim())
const isSelf = (a: PlatformAdmin) => !!session.state.user && session.state.user.email.toLowerCase() === a.email.toLowerCase()

const titles = {
  ADMIN_INVITE_EXISTING_USER: 'Bu e-posta adresi zaten bir kullanıcıya ait; mevcut hesaba platform yetkisi verilmez',
  ADMIN_INVITE_UNAVAILABLE: 'Davet e-postası şu an gönderilemiyor',
  LAST_PLATFORM_ADMIN: 'Son aktif platform yöneticisi devre dışı bırakılamaz',
  ADMIN_SELF_ACTION: 'Bu işlem kendi hesabınız üzerinde yapılamaz',
}

// Davet
const inviteEmail = ref('')
const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.value.trim()) && inviteEmail.value.trim().length <= 254)
const invite = useGuardedAction(
  async (_c: Record<string, never>, reason) => {
    try {
      return await api.call('BackofficeAdminUserService/invite', { email: inviteEmail.value.trim(), reason })
    } catch (e) {
      return remapError(e, titles)
    }
  },
  (r) => {
    notify('success', r.renewed ? 'Mevcut davet yenilendi; eski bağlantı geçersiz oldu.' : 'Davet gönderildi; bağlantı 48 saat geçerli.')
    void res.load()
  },
)
function openInvite() {
  inviteEmail.value = ''
  invite.open({})
}

const disable = useGuardedAction(
  async (a: PlatformAdmin, reason) => {
    try {
      return await api.call('BackofficeAdminUserService/disable', { sub: a.sub, reason })
    } catch (e) {
      return remapError(e, titles)
    }
  },
  (r, a) => {
    notify('success', r.status === 'revoked' ? `${a.email} için davet iptal edildi.` : `${full(a)} devre dışı bırakıldı; tüm oturumları kapandı.`)
    void res.load()
  },
)
const disableItems = computed(() =>
  disable.context.value?.status === 'invited'
    ? ['Davet bağlantısı geçersiz olur; bağlantıyla hesap açılamaz.', 'Bekleyen hesap taslağı silinir; istenirse yeniden davet edilebilir.']
    : ['Yöneticinin tüm oturumları anında kapanır.', 'Giriş yapamaz; hesap silinmez, yeniden etkinleştirilebilir.', 'Son aktif yönetici devre dışı bırakılamaz.'],
)
const enable = useGuardedAction(
  async (a: PlatformAdmin, reason) => {
    try {
      return await api.call('BackofficeAdminUserService/enable', { sub: a.sub, reason })
    } catch (e) {
      return remapError(e, titles)
    }
  },
  (_r, a) => {
    notify('success', `${full(a)} yeniden etkinleştirildi.`)
    void res.load()
  },
)
const resetMfa = useGuardedAction(
  async (a: PlatformAdmin, reason) => {
    try {
      return await api.call('BackofficeAdminUserService/resetMfa', { sub: a.sub, reason })
    } catch (e) {
      return remapError(e, titles)
    }
  },
  (_r, a) => {
    notify('success', `${full(a)} için iki adımlı doğrulama sıfırlandı; oturumları kapandı.`)
    void res.load()
  },
)

onMounted(() => res.load())
</script>

<style scoped>
.bo-admin__name {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}
.bo-admin__flags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}
</style>
