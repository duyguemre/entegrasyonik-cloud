<!--
  frontend/src/components/privacy/AccountDeletionPanel.vue

  N4 "Veri ve gizlilik" — mağaza (hesap) silme TALEBİ. Yalnız sahip (owner) görür; görünürlük
  kararı çağıran ekrandadır (PrivacyDataView, `isOwner()`), ASIL yetki sınırı backend'dedir.

  Akış (DS-v2 `EkDialog`, iki adım):
    1) Doğrulama diyaloğu: parola + mağaza adını AYNEN yazma. Ad eşleşmeden ve parola boşken "Sil" etkin olmaz.
    2) Son onay (tone="danger", varsayılan odak Vazgeç): "Silme talebi oluştur" → istek.
  Hata: 401 (yanlış parola) bu uçta OTURUM hatası değildir — çağrı `skipSessionRedirect` ile yapılır ve
  doğrulama diyaloğu parola alanı hatasıyla yeniden açılır. 400 mesajları alan hatasına eşlenir.

  Sözleşme (salt-okunur): `backend/src/api/services/tenant-data-service.ts:27` →
  `TenantLifecycleService.requestDeletion` sonucu `{ order, status, deletionScheduledAt }` (idempotent).
  Metinler yalnız backend davranışını anlatır (30 gün askı; geri alma destek/platform yöneticisi üzerinden).
  Hukuki/aydınlatma metni YAZILMAZ — yasal sayfa bağlantısı verilir.
-->
<template>
  <div class="accountDeletion">
    <div v-if="result" class="accountDeletion__panel accountDeletion__panel--done" role="status">
      <div class="accountDeletion__head">
        <EkIconTile icon="mdi-clock-alert-outline" tone="error" size="md" />
        <div class="accountDeletion__titles">
          <p class="accountDeletion__title">{{ $t('privacyData.deletion.doneTitle') }}</p>
          <p class="accountDeletion__text">
            {{ scheduledText !== '—' ? $t('privacyData.deletion.doneText', { date: scheduledText }) : $t('privacyData.deletion.doneTextNoDate') }}
          </p>
        </div>
      </div>
    </div>

    <div v-else class="accountDeletion__panel">
      <div class="accountDeletion__head">
        <EkIconTile icon="mdi-store-remove-outline" tone="error" size="md" />
        <div class="accountDeletion__titles">
          <p class="accountDeletion__title">{{ $t('privacyData.deletion.panelTitle') }}</p>
          <p class="accountDeletion__text">{{ $t('privacyData.deletion.panelText') }}</p>
        </div>
      </div>

      <ul class="accountDeletion__facts">
        <li v-for="fact in facts" :key="fact.key" class="accountDeletion__fact">
          <v-icon size="18" aria-hidden="true">{{ fact.icon }}</v-icon>
          <span>{{ $t(fact.key) }}</span>
        </li>
      </ul>

      <div class="accountDeletion__footer">
        <a :href="legalHref" target="_blank" rel="noopener noreferrer" class="accountDeletion__link">
          <span>{{ $t('privacyData.deletion.moreInfo') }}</span>
          <v-icon size="16" aria-hidden="true">mdi-open-in-new</v-icon>
          <span class="accountDeletion__sr">{{ $t('privacyData.legal.newTab') }}</span>
        </a>
        <EkButton tone="danger" icon="mdi-delete-outline" @click="openVerify">
          {{ $t('privacyData.deletion.action') }}
        </EkButton>
      </div>

      <p v-if="errorKey" class="accountDeletion__alert" role="alert">
        <v-icon size="18" aria-hidden="true">mdi-alert-circle-outline</v-icon>
        <span>{{ $t(errorKey) }}</span>
      </p>
    </div>

    <!-- Adım 1: doğrulama -->
    <EkDialog
      v-model="verifyOpen"
      tone="danger"
      width="md"
      icon="mdi-shield-key-outline"
      :title="$t('privacyData.deletion.verify.title')"
      :description="$t('privacyData.deletion.verify.description')"
      :confirm-label="$t('privacyData.deletion.verify.confirm')"
      confirm-icon="mdi-delete-outline"
      :confirm-disabled="!canContinue"
      @confirm="toFinalStep"
      @cancel="reset"
      @update:model-value="(v: boolean) => { if (!v && !finalOpen) resetFields() }"
    >
      <div class="accountDeletion__form" @keydown.enter.prevent="canContinue && toFinalStep()">
        <v-text-field
          ref="passwordRef"
          v-model="password"
          type="password"
          autocomplete="current-password"
          :label="$t('privacyData.deletion.verify.passwordLabel')"
          :error-messages="passwordError ? [$t(passwordError)] : []"
          aria-required="true"
          @update:model-value="passwordError = ''"
        />
        <div class="accountDeletion__typeName">
          <p :id="nameHintId" class="accountDeletion__typeHint">
            <template v-if="expectedName">
              {{ $t('privacyData.deletion.verify.typeNameHint') }}
              <strong class="accountDeletion__name" translate="no">{{ expectedName }}</strong>
            </template>
            <template v-else>{{ $t('privacyData.deletion.verify.typeNameHintUnknown') }}</template>
          </p>
          <v-text-field
            v-model="typedName"
            autocomplete="off"
            spellcheck="false"
            :label="$t('privacyData.deletion.verify.nameLabel')"
            :aria-describedby="nameHintId"
            :error-messages="nameError ? [$t(nameError)] : []"
            aria-required="true"
            @update:model-value="nameError = ''"
          />
        </div>
      </div>
    </EkDialog>

    <!-- Adım 2: son onay (varsayılan odak Vazgeç — EkDialog tone="danger") -->
    <EkDialog
      v-model="finalOpen"
      tone="danger"
      width="sm"
      icon="mdi-delete-alert-outline"
      :title="$t('privacyData.deletion.confirm.title', { name: expectedName || typedName.trim() })"
      :description="$t('privacyData.deletion.confirm.description')"
      :confirm-label="$t('privacyData.deletion.confirm.action')"
      confirm-icon="mdi-delete-outline"
      :confirm-loading="submitting"
      @confirm="submit"
      @cancel="reset"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import EkButton from '@/components/ds/EkButton.vue'
import EkDialog from '@/components/ds/EkDialog.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import { useToast } from '@/composables/useToast'
import { formatDateTime } from '@/composables/format'
import { apiStatus } from '@/composables/apiErrors'
import { SITE_LEGAL_PATHS, siteUrl } from '@/config/siteLinks'
import { deletionErrorOutcome, isDeletionResult, useTenantDataApi, type DeletionRequestResult } from '@/composables/useTenantDataApi'

const props = defineProps<{
  /** Kullanıcının yazması gereken mağaza adı (biliniyorsa). Boşsa istemci eşleşme denetimi yapılmaz; sunucu doğrular. */
  storeName?: string
}>()

const api = useTenantDataApi()
const { showToast } = useToast()
const { t } = useI18n()

const facts = [
  { key: 'privacyData.deletion.facts.suspend', icon: 'mdi-pause-circle-outline' },
  { key: 'privacyData.deletion.facts.restore', icon: 'mdi-lifebuoy' },
  { key: 'privacyData.deletion.facts.export', icon: 'mdi-database-export-outline' },
]
const legalHref = siteUrl(SITE_LEGAL_PATHS.kvkk)

const nameHintId = `account-deletion-name-${useId()}`
const expectedName = computed(() => (props.storeName ?? '').trim())

const verifyOpen = ref(false)
const finalOpen = ref(false)
const submitting = ref(false)
// Parola YALNIZCA bellekte ve akış süresince tutulur (depolama/log YOK); akış bitince temizlenir.
const password = ref('')
const typedName = ref('')
const passwordError = ref('')
const nameError = ref('')
const errorKey = ref('')
const result = ref<DeletionRequestResult | null>(null)
const passwordRef = ref<any>(null)

const nameMatches = computed(() => {
  const typed = typedName.value.trim()
  if (!typed) return false
  return expectedName.value ? typed === expectedName.value : true
})
const canContinue = computed(() => password.value.length > 0 && nameMatches.value)
const scheduledText = computed(() => formatDateTime(result.value?.deletionScheduledAt))

function resetFields() {
  password.value = ''
  typedName.value = ''
  passwordError.value = ''
  nameError.value = ''
}

function reset() {
  verifyOpen.value = false
  finalOpen.value = false
  resetFields()
}

function openVerify() {
  errorKey.value = ''
  resetFields()
  verifyOpen.value = true
}

function toFinalStep() {
  if (!canContinue.value) return
  verifyOpen.value = false
  finalOpen.value = true
}

async function submit() {
  if (submitting.value) return
  submitting.value = true
  const res: any = await api.requestDeletion(password.value, typedName.value.trim())
  submitting.value = false

  if (isDeletionResult(res)) {
    result.value = res
    reset()
    showToast({ tone: 'success', message: t('privacyData.deletion.toast') })
    return
  }

  const outcome = deletionErrorOutcome(apiStatus(res), res?.response?.data?.error)
  finalOpen.value = false
  if (outcome.field) {
    // Alan hatası: doğrulama adımına dön; yanlış parola alanı temizlenir, ad korunur.
    if (outcome.field === 'password') {
      password.value = ''
      passwordError.value = outcome.key
    } else {
      nameError.value = outcome.key
    }
    verifyOpen.value = true
    await nextTick()
    setTimeout(() => passwordRef.value?.focus?.(), 50)
    return
  }
  resetFields()
  errorKey.value = outcome.key
}
</script>

<style scoped>
.accountDeletion__panel {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-error-border);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
}

.accountDeletion__panel--done {
  background: var(--ek-color-error-subtle);
}

.accountDeletion__head {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
}

.accountDeletion__titles {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.accountDeletion__title {
  margin: 0;
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.accountDeletion__text {
  margin: 0;
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-default);
}

.accountDeletion__facts {
  list-style: none;
  margin: 0;
  padding: var(--ek-space-3) 0 0;
  border-top: 1px solid var(--ek-color-border-default);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.accountDeletion__fact {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}

.accountDeletion__fact .v-icon {
  margin-top: 1px;
  flex-shrink: 0;
  color: var(--ek-color-content-muted);
}

.accountDeletion__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
}

.accountDeletion__link {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: 44px;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-primary);
  text-decoration: none;
}

.accountDeletion__link:hover span:first-of-type {
  text-decoration: underline;
}

.accountDeletion__link:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
  border-radius: var(--ek-radius-sm);
}

.accountDeletion__alert {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-error-border);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-error-subtle);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-strong);
}

.accountDeletion__alert .v-icon {
  flex-shrink: 0;
  color: var(--ek-color-error);
}

.accountDeletion__form {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.accountDeletion__typeName {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.accountDeletion__typeHint {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}

.accountDeletion__name {
  display: inline-block;
  margin-left: var(--ek-space-1);
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-muted);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  user-select: all;
}

.accountDeletion__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
