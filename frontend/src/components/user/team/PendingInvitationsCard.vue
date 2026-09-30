<!--
  frontend/src/components/user/team/PendingInvitationsCard.vue

  Faz 3 / C2a — bekleyen davetler (API_ACCOUNT_LIFECYCLE.md §6 `listInvitations {status:'pending'}`). Sunumsal: veri,
  yükleniyor/hata durumu ve eylemler üst ekrandan (AuthorizationListView `#summary`). Satır: e-posta · rol çipi ·
  süre (kalan gün / süresi doldu) · eylemler (EkRowActions: Yeniden gönder, tehlikeli "Daveti iptal et" en sağda).
  Liste boşsa ve hata yoksa kart hiç çizilmez (boş kart gürültüsü yok). > 3 davette "Tümünü göster" (liste ekranı
  aşağı itilmesin). Geniş kapta (≥ 720px) satır tek çizgi: e-posta · rol · süre · eylemler (44px).
-->
<template>
  <EkCard
    v-if="loading || error || invitations.length"
    class="ek-invitations"
    :title="$t('team.invitations.title')"
    :subtitle="$t('team.invitations.subtitle')"
    icon="mdi-email-fast-outline"
    icon-tone="info"
    :heading-level="2"
    flush
    data-testid="pending-invitations"
  >
    <template #actions>
      <EkBadge v-if="invitations.length" :text="invitations.length" variant="count" tone="neutral" :aria-label="$t('team.invitations.count', { n: invitations.length })" />
    </template>

    <div v-if="loading && !invitations.length" class="ek-invitations__state" role="status" aria-live="polite">
      <EkSkeleton type="table" :rows="2" />
    </div>

    <div v-else-if="error" class="ek-invitations__state">
      <EkAlert tone="error" dense :text="$t('team.invitations.loadError')">
        <template #actions>
          <EkButton tone="secondary" size="sm" icon="mdi-refresh" @click="emit('retry')">{{ $t('team.invitations.retry') }}</EkButton>
        </template>
      </EkAlert>
    </div>

    <ul v-else class="ek-invitations__list">
      <li v-for="inv in visible" :key="inv.id" class="ek-invitation" :class="{ 'is-expired': isExpired(inv) }" data-testid="invitation-row">
        <span class="ek-invitation__avatar" aria-hidden="true">
          <v-icon size="16">{{ isExpired(inv) ? 'mdi-email-alert-outline' : 'mdi-email-outline' }}</v-icon>
        </span>
        <div class="ek-invitation__main">
          <span class="ek-invitation__email" :title="inv.email">{{ inv.email }}</span>
          <span class="ek-invitation__meta">
            <EkStatusChip :tone="inv.role === 'admin' ? 'info' : 'neutral'" :label="roleLabel(inv.role)" />
            <EkStatusChip v-if="isExpired(inv)" tone="warning" :label="$t('team.status.expired')" icon="mdi-clock-alert-outline" />
            <span class="ek-invitation__time ek-num">{{ timeText(inv) }}</span>
          </span>
        </div>
        <div class="ek-invitation__actions">
          <EkRowActions
            :label="`${inv.email} davet işlemleri`"
            :items="[
              { key: 'resend', action: 'send', label: isExpired(inv) ? $t('team.invitations.resendExpired') : $t('team.invitations.resend'), loading: busyId === inv.id, disabled: !!busyId, onClick: () => emit('resend', inv) },
              { key: 'revoke', action: 'cancel', label: $t('team.invitations.revoke'), disabled: !!busyId, onClick: () => emit('revoke', inv) },
            ]"
          />
        </div>
      </li>
    </ul>

    <template v-if="!error && invitations.length > LIMIT" #footer>
      <button type="button" class="ek-invitations__more" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ expanded ? $t('team.invitations.showLess') : $t('team.invitations.showAll', { n: invitations.length }) }}
        <v-icon size="16" aria-hidden="true">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </button>
    </template>
  </EkCard>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkAlert, EkBadge, EkButton, EkCard, EkRowActions, EkSkeleton, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatDate } from '@entegrasyonik/ui/format'
import { daysLeft, invitationExpired, type Invitation } from './teamModel'

const props = defineProps<{ invitations: Invitation[]; loading?: boolean; error?: boolean; busyId?: string | null }>()
const emit = defineEmits<{ resend: [inv: Invitation]; revoke: [inv: Invitation]; retry: [] }>()

const { t, te } = useI18n()
const LIMIT = 3
const expanded = ref(false)
const visible = computed(() => (expanded.value ? props.invitations : props.invitations.slice(0, LIMIT)))

const isExpired = (inv: Invitation) => invitationExpired(inv)
const roleLabel = (role: string) => (te(`team.roles.${role}`) ? t(`team.roles.${role}`) : role)

function timeText(inv: Invitation): string {
  if (!inv.expiresAt) return ''
  const date = formatDate(inv.expiresAt)
  if (isExpired(inv)) return t('team.invitations.expiredAt', { date })
  const left = daysLeft(inv.expiresAt)
  const tail = left === 0 ? t('team.invitations.lastDay') : t('team.invitations.daysLeft', { n: left })
  return `${t('team.invitations.expires', { date })} · ${tail}`
}
</script>

<style scoped>
.ek-invitations {
  container-type: inline-size;
}

.ek-invitations__state {
  padding: var(--ek-space-4) var(--ek-space-5);
}

.ek-invitations__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-invitation {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 56px;
  padding: var(--ek-space-2) var(--ek-space-3) var(--ek-space-2) var(--ek-space-5);
  transition: var(--ek-transition-colors);
}

.ek-invitation + .ek-invitation {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-invitation:hover {
  background: var(--ek-color-surface-muted);
}

.ek-invitation__avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
}

.ek-invitation.is-expired .ek-invitation__avatar {
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.ek-invitation__main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.ek-invitation__email {
  overflow: hidden;
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-invitation__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-invitation__time {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-invitation__actions {
  flex: none;
}

.ek-invitations__more {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  padding: var(--ek-space-1) var(--ek-space-2);
  border-radius: var(--ek-radius-control);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  color: var(--ek-color-action);
  transition: var(--ek-transition-colors);
}

.ek-invitations__more:hover {
  background: var(--ek-color-action-subtle);
}

.ek-invitations__more:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

@container (min-width: 720px) {
  .ek-invitation {
    min-height: 48px;
    padding-top: var(--ek-space-1);
    padding-bottom: var(--ek-space-1);
  }
  .ek-invitation__avatar {
    width: 28px;
    height: 28px;
  }
  .ek-invitation__main {
    flex-direction: row;
    align-items: center;
    gap: var(--ek-space-4);
  }
  .ek-invitation__email {
    flex: 0 1 340px;
  }
}

@media (max-width: 599px) {
  .ek-invitation {
    align-items: flex-start;
    padding-left: var(--ek-space-4);
  }
  .ek-invitation__avatar {
    display: none;
  }
}
</style>
