<!--
  DangerActionDialog — TEHLİKELİ / HASSAS İŞLEM ONAYI için tek bileşen (BO_UI_PATTERNS §6; ADR-0026 Karar 4.6).
  Diyalog her zaman aynı dört soruyu aynı sırayla yanıtlar:
    1. Ne olacak?            → `action` (+ isteğe bağlı `details` maddeleri)
    2. Geri alınabilir mi?   → `reversible` + `reversibleNote`
    3. Kim etkilenir?        → `tenant` (mağaza adı + #no) ya da `scope` ("Tüm müşteriler", "Sipariş kuyruğu")
    4. Neden?                → gerekçe (≥10 karakter; denetim kaydına `meta.reason` olarak yazılır)
  BO-ELEV (DA-1): ilk satır ORTAM'dır — üst bardaki rozet diyalog örtüsünün altında kalır; en kritik anda ortam diyalogda
  görünür (Üretim kırmızı, Staging sarı).
  Kimlik doğrulama (step-up) durumu da gösterilir: son 5 dk içinde doğrulanmadıysa onayda parola + kod diyaloğu açılır
  (istemci `REAUTH_REQUIRED`'ı yakalar, isteği bir kez yeniler — bileşen bunu ayrıca yapmaz).
  Onay sonrası ekran `notifyAudited(...)` ile toast + "Denetim kaydını aç" bağlantısı gösterir.

    <DangerActionDialog v-model="open" title="Hesaba geçici erişim" action="…" :reversible="true" :tenant="{ tid, name }"
      confirm-label="Gerekçeyle başlat" :busy="busy" :error="error" @confirm="(reason) => run(reason)" />
-->
<template>
  <EkDialog
    :model-value="modelValue"
    :title="title"
    :description="description"
    :icon="icon"
    :tone="destructive ? 'danger' : 'default'"
    width="md"
    as-form
    :confirm-label="confirmLabel"
    :confirm-icon="confirmIcon"
    :confirm-loading="busy"
    :confirm-disabled="!canConfirm"
    @update:model-value="$emit('update:modelValue', $event)"
    @confirm="confirm"
  >
    <div class="bo-danger">
      <dl class="bo-danger__facts">
        <div class="bo-danger__fact" :class="`is-env-${currentEnv.key}`" data-testid="danger-env">
          <dt><v-icon :icon="currentEnv.icon" aria-hidden="true" />Ortam</dt>
          <dd>
            <EkStatusChip :tone="ENV_TONE[currentEnv.key]" :label="currentEnv.key === 'production' ? 'ÜRETİM' : currentEnv.label" dot />
            <span class="bo-danger__note">{{ currentEnv.hint }}</span>
          </dd>
        </div>
        <div class="bo-danger__fact">
          <dt><v-icon icon="mdi-lightning-bolt-outline" aria-hidden="true" />Ne olacak</dt>
          <dd>
            {{ action }}
            <ul v-if="details?.length" class="bo-danger__details">
              <li v-for="d in details" :key="d">{{ d }}</li>
            </ul>
          </dd>
        </div>
        <div class="bo-danger__fact">
          <dt><v-icon :icon="reversible ? 'mdi-undo-variant' : 'mdi-alert-outline'" aria-hidden="true" />Geri alınabilir mi</dt>
          <dd>
            <EkStatusChip :tone="reversible ? 'success' : 'danger'" :label="reversible ? 'Geri alınabilir' : 'Geri alınamaz'" dot />
            <span v-if="reversibleNote" class="bo-danger__note">{{ reversibleNote }}</span>
          </dd>
        </div>
        <div v-if="tenant || scope" class="bo-danger__fact">
          <dt><v-icon icon="mdi-storefront-outline" aria-hidden="true" />Etkilenen</dt>
          <dd>
            <template v-if="tenant">
              <strong>{{ tenant.name }}</strong> <span class="bo-mono ek-num">#{{ tenant.tid }}</span>
            </template>
            <template v-else>{{ scope }}</template>
          </dd>
        </div>
        <div class="bo-danger__fact">
          <dt><v-icon icon="mdi-shield-key-outline" aria-hidden="true" />Kimlik doğrulama</dt>
          <dd>
            <template v-if="stepUpActive">Doğrulandı — bu işlem için yeniden sorulmayacak.</template>
            <template v-else>Onayladığınızda parola ve doğrulama kodu istenecek (5 dk geçerli).</template>
          </dd>
        </div>
      </dl>

      <!-- bo-p2 (ekleyici): işleme özgü alanlar (ör. gün sayısı, hedef plan, e-posta) gerekçenin üstünde. -->
      <slot />

      <v-textarea
        v-if="requireReason"
        v-model="reason"
        label="Gerekçe"
        :placeholder="reasonPlaceholder"
        rows="3"
        auto-grow
        counter="500"
        maxlength="500"
        :hint="reasonHint"
        persistent-hint
        :error-messages="error || undefined"
        autofocus
      />
      <p v-else-if="error" class="bo-danger__error" role="alert">{{ error }}</p>

      <!-- NT-02 (BO-ELEV DA-3): üretimde yıkıcı işlem hedef kimliğinin elle yazılmasını ister (kopyala-yapıştır değil, okuma). -->
      <v-text-field
        v-if="typedRequired"
        v-model="typed"
        class="bo-danger__typed"
        :label="`Onay için ${confirmText} yazın`"
        :hint="typedOk ? 'Kimlik eşleşti.' : 'Üretimde yıkıcı işlem: hedefin kimliğini aynen yazın.'"
        persistent-hint
        autocomplete="off"
        spellcheck="false"
        data-testid="danger-confirm-text"
      />
    </div>
  </EkDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EkDialog, EkStatusChip, type StatusTone } from '@entegrasyonik/ui/components'
import { session } from '@bo/auth/session'
import { currentEnv, type EnvKey } from '@bo/utils/env'

const ENV_TONE: Record<EnvKey, StatusTone> = { production: 'danger', staging: 'warning', mock: 'info', local: 'neutral' }

const REASON_MIN = 10
const STEP_UP_MS = 5 * 60 * 1000

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    description?: string
    icon?: string
    /** Ne olacak — tek cümle, sade dil. */
    action: string
    details?: string[]
    reversible: boolean
    reversibleNote?: string
    tenant?: { tid: number; name: string }
    /** Müşteri yerine kapsam (ör. "Sipariş kuyruğu · 1 iş"). */
    scope?: string
    /** Yıkıcı işlem: kırmızı ton (silme, atma, iptal). Geçici erişim gibi hassas ama yıkıcı olmayan işlemde false. */
    destructive?: boolean
    confirmLabel?: string
    confirmIcon?: string
    requireReason?: boolean
    reasonPlaceholder?: string
    busy?: boolean
    /** bo-p2 (ekleyici): işleme özgü ek alan geçersizken onayı kapatır. */
    blocked?: boolean
    error?: string
    /** NT-02: üretimde (`currentEnv.key === 'production'`) ve `destructive` iken onay için aynen yazılması gereken hedef kimliği. */
    confirmText?: string
  }>(),
  {
    icon: 'mdi-shield-alert-outline',
    destructive: false,
    confirmLabel: 'Gerekçeyle onayla',
    confirmIcon: 'mdi-check',
    requireReason: true,
    reasonPlaceholder: 'ör. Destek talebi #1234: sipariş eşleme hatası',
    busy: false,
    error: '',
  },
)
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; confirm: [reason: string] }>()

const reason = ref('')
const typed = ref('')
const typedRequired = computed(() => !!props.destructive && currentEnv.key === 'production' && !!props.confirmText)
const typedOk = computed(() => !typedRequired.value || typed.value.trim() === props.confirmText)
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    reason.value = ''
    typed.value = ''
    // Doğrulama penceresi sunucuda dolmuş olabilir: "Kimlik doğrulama" satırı güncel `reauthAt`'i göstersin.
    void session.refresh()
  },
)

const length = computed(() => reason.value.trim().length)
const canConfirm = computed(() => !props.busy && !props.blocked && typedOk.value && (!props.requireReason || length.value >= REASON_MIN))
const reasonHint = computed(() =>
  length.value < REASON_MIN ? `En az ${REASON_MIN} karakter (${length.value}/${REASON_MIN}). Denetim kaydına yazılır.` : 'Bu metin denetim kaydına işlemle birlikte yazılır.',
)
const stepUpActive = computed(() => {
  const at = session.state.user?.reauthAt
  return !!at && Date.now() - Date.parse(at) < STEP_UP_MS
})

function confirm() {
  if (canConfirm.value) emit('confirm', reason.value.trim())
}
</script>

<style scoped>
.bo-danger {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.bo-danger__facts {
  display: flex;
  flex-direction: column;
  margin: 0;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface-muted);
}

.bo-danger__fact {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
}

/* Üretim/staging: ortam satırı üst kenarında renk şeridi (yalnız bu satır; diyalog sakin kalır). */
.bo-danger__fact.is-env-production {
  border-radius: var(--ek-radius-lg) var(--ek-radius-lg) 0 0;
  background: var(--ek-color-error-subtle);
  box-shadow: inset 3px 0 0 var(--ek-color-error);
}

.bo-danger__fact.is-env-staging {
  border-radius: var(--ek-radius-lg) var(--ek-radius-lg) 0 0;
  background: var(--ek-color-warning-subtle);
  box-shadow: inset 3px 0 0 var(--ek-color-warning);
}

.bo-danger__fact + .bo-danger__fact {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-danger__fact dt {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-danger__fact dt .v-icon {
  margin-top: 1px;
  font-size: var(--ek-icon-sm);
}

.bo-danger__fact dd {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.bo-danger__fact dd strong {
  color: var(--ek-color-content-strong);
}

.bo-danger__details {
  flex-basis: 100%;
  margin: 0;
  padding-left: var(--ek-space-5);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

.bo-danger__note {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

.bo-danger__error {
  margin: 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-label-size);
}

@media (max-width: 599px) {
  .bo-danger__fact {
    grid-template-columns: 1fr;
    gap: var(--ek-space-1);
  }
}
</style>
