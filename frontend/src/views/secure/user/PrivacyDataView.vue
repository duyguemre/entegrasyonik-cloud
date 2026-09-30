<!--
  frontend/src/views/secure/user/PrivacyDataView.vue

  ADR-0015 B4-P0 — N4 "Veri ve gizlilik (KVKK)": veri taşınabilirliği (dışa aktarma + indirme) ve
  aydınlatma metni. `EkSettingsTemplate` (Karar 3.9.2 / 6.1).
  Not (Karar 6.4 desen mandalı): `EkPageHeader` bu dosyada DOĞRUDAN kullanılmaz — `EkSettingsTemplate`
  onu İÇİNDE render eder (EngineSettingsView ile aynı emsal).

  Sözleşme: `docs/API_TENANT_SURFACE.md` §5 — `TenantDataService/exportTenantData` (owner) + `GET
  /api/tenant-data/export/download?token=` (owner, oturum çerezi, TEK kullanımlık, 24 sa). Backend
  karşılığı (salt-okunur, grep): `tenant-data-service.ts:70`, `ExportDownloadApiManager.ts:18`.
  Arşiv kapsamı `backend/src/operations/tenant/exportCollections.ts` envanterinden yazıldı (sırlar hariç).

  Hesap/mağaza silme talebi (`TenantDataService/requestDeletion`, yalnız owner): `AccountDeletionPanel`
  (iki adımlı DS-v2 `EkDialog` akışı; yanlış parola 401'i yerelde yakalanır, genel oturum yönlendirmesi değişmez).

  BİLİNÇLİ SINIRLAR ("sözleşme bekliyor", rapora yazıldı):
  - Müşteri anonimleştirme (`CustomerService.anonymizeCustomer`) müşteri detayına aittir (B4 dışı dosya).
  - "Arşiv 7 gün sonra silinir" İDDİA EDİLMEZ: backend'de zamanlayıcı yok (§5 sınırlama 2).
-->
<template>
  <div class="privacyDataView">
    <EkSettingsTemplate section="Hesap" :title="$t('privacyData.title')" :description="$t('privacyData.description')">
      <EkSettingsSection :title="$t('privacyData.export.title')" :description="$t('privacyData.export.description')">
        <template #title-extra><EkHelpHint hint="privacy.export" /></template>
        <ul class="privacyDataView__facts">
          <li v-for="fact in facts" :key="fact.key" class="privacyDataView__fact">
            <v-icon size="18" aria-hidden="true">{{ fact.icon }}</v-icon>
            <span>{{ $t(fact.key) }}</span>
          </li>
        </ul>

        <div v-if="!isOwner" class="privacyDataView__notice" role="note">
          <v-icon size="18" aria-hidden="true">mdi-shield-lock-outline</v-icon>
          <span>{{ $t('privacyData.export.ownerOnlyHint') }}</span>
        </div>

        <template v-else>
          <div v-if="phase === 'ready' || phase === 'downloading'" class="privacyDataView__panel" role="status">
            <div class="privacyDataView__panel-head">
              <v-icon size="20" aria-hidden="true" class="privacyDataView__ok">mdi-archive-check-outline</v-icon>
              <p class="privacyDataView__panel-title">{{ $t('privacyData.export.readyTitle') }}</p>
            </div>
            <p class="privacyDataView__panel-text">
              {{ $t('privacyData.export.readyText', { expiresAt: expiresAtText }) }}
            </p>
            <div class="privacyDataView__actions">
              <v-btn color="primary" class="text-none" prepend-icon="mdi-download-outline" :loading="phase === 'downloading'" @click="download">
                {{ $t('privacyData.download.action') }}
              </v-btn>
            </div>
          </div>

          <div v-else-if="phase === 'downloaded'" class="privacyDataView__panel" role="status">
            <div class="privacyDataView__panel-head">
              <v-icon size="20" aria-hidden="true" class="privacyDataView__ok">mdi-check-circle-outline</v-icon>
              <p class="privacyDataView__panel-title">{{ $t('privacyData.download.doneTitle') }}</p>
            </div>
            <p class="privacyDataView__panel-text">{{ $t('privacyData.download.doneText', { filename: downloadedName }) }}</p>
            <div class="privacyDataView__actions">
              <v-btn variant="outlined" class="text-none" prepend-icon="mdi-refresh" @click="prepare">
                {{ $t('privacyData.export.again') }}
              </v-btn>
            </div>
          </div>

          <div v-else class="privacyDataView__actions privacyDataView__actions--start">
            <v-btn color="primary" class="text-none" prepend-icon="mdi-file-export-outline" :loading="phase === 'preparing'" @click="prepare">
              {{ $t('privacyData.export.action') }}
            </v-btn>
            <span v-if="phase === 'preparing'" class="privacyDataView__muted" role="status">{{ $t('privacyData.export.preparing') }}</span>
          </div>

          <p v-if="errorKey" class="privacyDataView__notice privacyDataView__notice--error" role="alert">
            <v-icon size="18" aria-hidden="true">mdi-alert-circle-outline</v-icon>
            <span>{{ $t(errorKey) }}</span>
          </p>
        </template>
      </EkSettingsSection>

      <EkSettingsSection
        v-if="isOwner"
        :title="$t('privacyData.deletion.title')"
        :description="$t('privacyData.deletion.description')"
        class="privacyDataView__deletion"
      >
        <template #title-extra><EkHelpHint hint="privacy.delete" /></template>
        <AccountDeletionPanel :store-name="storeName" />
      </EkSettingsSection>

      <EkSettingsSection :title="$t('privacyData.legal.title')" :description="$t('privacyData.legal.description')">
        <ul class="privacyDataView__links">
          <li v-for="link in legalLinks" :key="link.key">
            <a :href="link.href" target="_blank" rel="noopener noreferrer" class="privacyDataView__link">
              <v-icon size="18" aria-hidden="true">mdi-file-document-outline</v-icon>
              <span>{{ $t(link.key) }}</span>
              <v-icon size="16" aria-hidden="true" class="privacyDataView__external">mdi-open-in-new</v-icon>
              <span class="privacyDataView__sr">{{ $t('privacyData.legal.newTab') }}</span>
            </a>
          </li>
        </ul>
      </EkSettingsSection>
    </EkSettingsTemplate>
  </div>
</template>

<script setup lang="ts">
import EkHelpHint from '@/components/page/EkHelpHint.vue'
import { computed, ref } from 'vue'
import EkSettingsTemplate from '@/components/page/templates/EkSettingsTemplate.vue'
import EkSettingsSection from '@/components/page/templates/EkSettingsSection.vue'
import AccountDeletionPanel from '@/components/privacy/AccountDeletionPanel.vue'
import useUser from '@/composables/user'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '@entegrasyonik/ui/format'
import { apiStatus, isApiError } from '@/composables/apiErrors'
import { SITE_LEGAL_PATHS, siteUrl } from '@/config/siteLinks'
import { downloadErrorKey, exportErrorKey, useTenantDataApi } from '@/composables/useTenantDataApi'

const api = useTenantDataApi()
const userApi = useUser()
const { showToast } = useToast()
const { t } = useI18n()

// İstemci tarafı görünürlük ipucu (savunma derinliği); ASIL yetki sınırı backend `owner` kademesidir.
const isOwner = computed(() => userApi.isOwner?.() === true)
// Silme onayında yazılacak ad. Not: backend `Clients.title` ile karşılaştırır; FE'de o alan yok,
// en yakın kaynak ayarlardaki mağaza adıdır (farklıysa sunucu 400 döner ve alan hatası gösterilir — YEREL NOT).
const storeName = computed(() => String(userApi.getStoreName?.() ?? '').trim())

const facts = [
  { key: 'privacyData.export.facts.scope', icon: 'mdi-folder-zip-outline' },
  { key: 'privacyData.export.facts.secrets', icon: 'mdi-key-remove' },
  { key: 'privacyData.export.facts.validity', icon: 'mdi-timer-outline' },
  { key: 'privacyData.export.facts.singleUse', icon: 'mdi-delete-clock-outline' },
]

const legalLinks = [
  { key: 'privacyData.legal.kvkk', href: siteUrl(SITE_LEGAL_PATHS.kvkk) },
  { key: 'privacyData.legal.terms', href: siteUrl(SITE_LEGAL_PATHS.terms) },
]

type Phase = 'idle' | 'preparing' | 'ready' | 'downloading' | 'downloaded'
const phase = ref<Phase>('idle')
const errorKey = ref('')
// Token YALNIZCA bellekte (URL/depolama/log YOK — §5 sınırlama 3).
let downloadToken = ''
const expiresAt = ref<string | undefined>()
const downloadedName = ref('')
const expiresAtText = computed(() => formatDateTime(expiresAt.value))

async function prepare() {
  errorKey.value = ''
  phase.value = 'preparing'
  const res: any = await api.exportTenantData()
  if (!isApiError(res) && res?.success === true && typeof res.downloadToken === 'string' && res.downloadToken) {
    downloadToken = res.downloadToken
    expiresAt.value = res.expiresAt
    phase.value = 'ready'
    return
  }
  phase.value = 'idle'
  errorKey.value = exportErrorKey(apiStatus(res))
}

async function download() {
  if (!downloadToken) return
  errorKey.value = ''
  phase.value = 'downloading'
  const result = await api.downloadExport(downloadToken)
  if (result.ok) {
    downloadToken = ''
    downloadedName.value = result.filename
    phase.value = 'downloaded'
    showToast({ tone: 'success', message: t('privacyData.download.toast') })
    return
  }
  errorKey.value = downloadErrorKey(result.status)
  // 400/410: bağlantı artık kullanılamaz → kullanıcı yeniden hazırlamalı; diğerlerinde (429/5xx) aynı token yeniden denenebilir.
  if (result.status === 400 || result.status === 410) {
    downloadToken = ''
    phase.value = 'idle'
  } else {
    phase.value = 'ready'
  }
}

defineExpose({
  initialize: () => {},
  activate: () => {},
})
</script>

<style scoped>
.privacyDataView {
  padding: var(--ek-space-6);
}

/* ADR-0015 Karar 6.2 — sayfa iç boşluğu: masaüstü 6, tablet 4, mobil 3. */
@media (max-width: 1023px) {
  .privacyDataView {
    padding: var(--ek-space-4);
  }
}

@media (max-width: 767px) {
  .privacyDataView {
    padding: var(--ek-space-3);
  }
}

.privacyDataView__facts,
.privacyDataView__links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.privacyDataView__fact {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-default);
}

.privacyDataView__fact .v-icon {
  margin-top: 1px;
  flex-shrink: 0;
  color: var(--ek-color-content-muted);
}

.privacyDataView__panel {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
}

.privacyDataView__panel-head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.privacyDataView__panel-title {
  margin: 0;
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.privacyDataView__panel-text {
  margin: 0;
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-default);
}

.privacyDataView__ok {
  color: var(--ek-color-success);
}

.privacyDataView__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-3);
}

.privacyDataView__actions--start {
  justify-content: flex-start;
}

.privacyDataView__muted {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.privacyDataView__notice {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3);
  border-radius: var(--ek-radius-md);
  font-size: var(--ek-font-size-sm);
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.privacyDataView__notice .v-icon {
  flex-shrink: 0;
  color: var(--ek-color-content-muted);
}

.privacyDataView__notice--error {
  border-color: var(--ek-color-error);
}

.privacyDataView__notice--error .v-icon {
  color: var(--ek-color-error);
}

.privacyDataView__link {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 44px;
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-primary);
  text-decoration: none;
}

.privacyDataView__link:hover span:first-of-type {
  text-decoration: underline;
}

.privacyDataView__link:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
  border-radius: var(--ek-radius-sm);
}

.privacyDataView__external {
  color: var(--ek-color-content-muted);
}

.privacyDataView__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
