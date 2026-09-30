<template>
  <EkDetailSheet :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" :identity="identity">
    <template #status>
      <EkStatusChip v-if="message" :tone="effectiveTone" :label="effectiveLabel" />
    </template>

    <div v-if="message" class="d-flex flex-column ek-gap-8">
      <div class="d-flex align-center flex-wrap ek-gap-4">
        <div class="d-flex flex-column justify-center flex-grow-1">
          <div class="d-flex align-center ek-gap-2 flex-wrap">
            <span class="text-caption font-weight-medium ek-chip-neutral"><v-icon size="14" class="mr-1">{{ MESSAGE_TYPE_ICONS[message.type as MessageTypeEnum] }}</v-icon>{{ MESSAGE_TYPE_LABELS[message.type as MessageTypeEnum] }}</span>
            <span class="text-caption font-weight-medium ek-chip-neutral text-uppercase">{{ message.integrationCode }}</span>
          </div>
          <div class="text-caption ek-muted mt-2">Gönderim tarihi: {{ formatDateTime(message.date) }}</div>
          <MessageWaitChip v-if="awaiting" class="mt-2" :message="message" :now="now" show-hint />
        </div>

        <div class="customer-preview pa-3 rounded-lg border-subtle d-flex align-center">
          <v-avatar color="surface-muted" size="36" class="mr-3">
            <span class="text-caption font-weight-bold">
              {{ message.customer ? (message.customer.firstName?.[0] + message.customer.lastName?.[0]) : (message.externalUserName?.[0] || '?') }}
            </span>
          </v-avatar>
          <div class="d-flex flex-column">
            <span class="text-caption font-weight-medium">
              {{ message.customer ? `${message.customer.firstName} ${message.customer.lastName}` : (message.externalUserName || 'Anonim müşteri') }}
            </span>
            <span class="text-caption ek-muted">{{ message.customer?.phone || 'Pazaryeri müşterisi' }}</span>
          </div>
        </div>
      </div>

      <v-alert v-if="message.isRejected" type="error" icon="mdi-alert-octagon-outline">
        <div class="text-caption font-weight-semibold">Pazaryeri red sebebi</div>
        <div class="text-body-2">{{ message.rejectionReason || 'Belirtilmemiş bir hata nedeniyle reddedildi.' }}</div>
        <div v-if="message.rejectedAt" class="text-caption ek-muted mt-1">Tarih: {{ formatDateTime(message.rejectedAt) }}</div>
      </v-alert>

      <EkSection title="Mesaj">
        <div class="message-bubble pa-4 rounded-lg border-subtle">
          <div class="text-body-2">{{ message.text }}</div>
        </div>
      </EkSection>

      <EkSection v-if="message.context" title="İlgili kayıt">
        <div class="context-card pa-4 rounded-lg border-subtle d-flex align-center ek-gap-4">
          <v-avatar v-if="message.context.imageUrl" rounded="lg" size="56">
            <v-img :src="message.context.imageUrl" cover />
          </v-avatar>
          <v-icon v-else size="36" color="content-subtle">mdi-package-variant</v-icon>

          <div class="d-flex flex-column flex-grow-1">
            <span v-if="message.context.productName" class="text-caption font-weight-medium">{{ message.context.productName }}</span>
            <div class="d-flex align-center ek-gap-2 mt-1">
              <span v-if="message.context.orderNumber" class="text-caption ek-num ek-link-color">Sipariş: {{ message.context.orderNumber }}</span>
              <span v-if="message.context.productMainId" class="text-caption ek-muted">Model: {{ message.context.productMainId }}</span>
              <v-btn v-if="message.orderId" variant="text" size="small" color="primary" :to="{ name: 'OrderListView', query: { search: message.context.orderNumber } }">
                Siparişe git
              </v-btn>
            </div>
          </div>
        </div>
      </EkSection>

      <EkSection title="Yanıt">
        <div v-if="message.answer && !message.isRejected">
          <div class="text-caption ek-muted mb-2">Gönderilen cevap</div>
          <div class="answer-bubble pa-4 rounded-lg border-subtle">
            {{ message.answer }}
            <div class="text-right mt-2 text-caption ek-muted">Cevaplanma: {{ formatDateTime(message.answeredAt) }}</div>
          </div>
        </div>

        <div v-else-if="!(message.status === MessageStatusEnum.ANSWERED || message.isRejected === true)">
          <v-textarea v-model="answerText" label="Cevabınızı buraya yazınız…" rows="4" auto-grow
            class="ek-message-answer"
            :placeholder="message.isRejected ? 'Red sebebine göre cevabınızı güncelleyiniz…' : 'Müşteriye nazik ve açıklayıcı bir cevap veriniz.'"
            :counter="answerRule ? answerRule.max : true"
            :counter-value="() => answerLength.count"
            :hint="answerHint"
            persistent-hint
            persistent-counter
            :error-messages="answerError"
            @blur="answerTouched = true" />

          <div class="d-flex justify-end mt-4">
            <EkButton tone="primary" icon="mdi-send" :disabled="!canSend" :loading="loading" @click="submitReply">
              {{ message.isRejected ? 'Güncelle ve gönder' : 'Cevabı gönder' }}
            </EkButton>
          </div>
        </div>
      </EkSection>
    </div>

    <EkSkeleton v-else type="detail" />
  </EkDetailSheet>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import EkDetailSheet from '@/components/ds/EkDetailSheet.vue';
import EkSection from '@/components/ds/EkSection.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkSkeleton from '@/components/ds/EkSkeleton.vue';
import EkButton from '@/components/ds/EkButton.vue';
import MessageWaitChip from './MessageWaitChip.vue';
import { answerLengthState, answerRuleFor, isAwaitingReply } from './messageSla';
import { formatDateTime } from '@/composables/format';
import { MESSAGE_STATUS_TONE, type StatusTone } from '@/design/status-map';
import {
  MessageStatusEnum,
  MESSAGE_STATUS_LABELS,
  MessageTypeEnum,
  MESSAGE_TYPE_LABELS,
  MESSAGE_TYPE_ICONS
} from '@/types/MessageTypes';

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  message: {
    type: Object,
    default: () => null
  }
});

const emit = defineEmits(['update:modelValue', 'reply']);

const { t } = useI18n();

const answerText = ref('');
const answerTouched = ref(false);
const loading = ref(false);
const now = ref(new Date());

watch(() => props.modelValue, (val) => {
  if (val && props.message) {
    // Sadece reddedildiyse eski metni getir, yoksa temiz başla
    answerText.value = props.message.isRejected ? (props.message.answer || '') : '';
    answerTouched.value = false;
    loading.value = false;
    now.value = new Date();
  }
});

// C2.5 — kanal karakter kuralı: yalnız belgeli kanalda zorlanır, diğerlerinde sayaç bilgi amaçlı.
const awaiting = computed(() => isAwaitingReply(props.message));
const answerRule = computed(() => answerRuleFor(props.message?.integrationCode));
const answerLength = computed(() => answerLengthState(answerText.value, answerRule.value));
const canSend = computed(() => answerLength.value.state === 'ok' && !loading.value);

const answerHint = computed(() => {
  const rule = answerRule.value;
  if (!rule) return t('messages.sla.answer.noRule');
  if (answerLength.value.state === 'tooShort') return t('messages.sla.answer.tooShort', { min: rule.min, channel: rule.channel });
  return t('messages.sla.answer.rule', { channel: rule.channel, min: rule.min, max: rule.max });
});

const answerError = computed(() => {
  const rule = answerRule.value;
  if (!rule) return [];
  if (answerLength.value.state === 'tooLong') return [t('messages.sla.answer.tooLong', { max: rule.max, channel: rule.channel })];
  if (answerLength.value.state === 'tooShort' && answerTouched.value) return [t('messages.sla.answer.tooShort', { min: rule.min, channel: rule.channel })];
  return [];
});

function submitReply() {
  // Gönderim öncesi doğrulama: düğme devre dışı olsa da (Enter/programatik çağrı) kural burada da uygulanır.
  if (answerLength.value.state !== 'ok') {
    answerTouched.value = true;
    return;
  }
  loading.value = true;
  emit('reply', {
    messageId: props.message._id,
    answerText: answerText.value
  });
}

const identity = computed(() => props.message ? MESSAGE_TYPE_LABELS[props.message.type as MessageTypeEnum] : 'Mesaj detayı');
const effectiveTone = computed<StatusTone>(() => {
  if (!props.message) return 'neutral';
  if (props.message.isRejected) return 'danger';
  return MESSAGE_STATUS_TONE[props.message.status as MessageStatusEnum]?.tone ?? 'neutral';
});
const effectiveLabel = computed(() => {
  if (!props.message) return '';
  if (props.message.isRejected) return 'Reddedildi';
  return MESSAGE_STATUS_LABELS[props.message.status as MessageStatusEnum] ?? props.message.status;
});
</script>

<style scoped>
.ek-gap-2 { gap: var(--ek-space-2); }
.ek-gap-4 { gap: var(--ek-space-4); }
.ek-gap-8 { gap: var(--ek-space-8); }

.border-subtle {
  border: 1px solid var(--ek-color-border-default);
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-link-color {
  color: var(--ek-color-primary);
}

.ek-chip-neutral {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-neutral-subtle);
  color: var(--ek-color-content-default);
}

.ek-message-answer :deep(.v-counter) {
  font-variant-numeric: tabular-nums;
}

.customer-preview {
  min-width: 180px;
}

.message-bubble,
.answer-bubble,
.context-card {
  border-radius: var(--ek-radius-lg);
}
</style>
