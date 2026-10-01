<template>
  <EkDetailSheet :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" :identity="identity">
    <template #status>
      <EkStatusChip v-if="message" :tone="effectiveTone" :label="effectiveLabel" />
    </template>

    <!-- FR2-SCREENS 35 (fe-r2d): mesaj = sohbet görünümü (müşteri balonu → sizin yanıtınız → yanıt alanı). -->
    <div v-if="message" class="ek-md">
      <div class="ek-md-context">
        <span class="ek-md-type"><v-icon size="16" :icon="MESSAGE_TYPE_ICONS[message.type as MessageTypeEnum]" aria-hidden="true" />{{ MESSAGE_TYPE_LABELS[message.type as MessageTypeEnum] }}</span>
        <EkChannelDot :code="message.integrationCode" />
        <MessageWaitChip v-if="awaiting" :message="message" :now="now" />
      </div>

      <EkAlert v-if="message.isRejected" tone="error" title="Pazaryeri yanıtınızı reddetti" :text="message.rejectionReason || 'Pazaryeri bir gerekçe iletmedi.'">
        <div v-if="message.rejectedAt" class="ek-md-muted ek-num">{{ formatDateTime(message.rejectedAt) }}</div>
      </EkAlert>

      <ol class="ek-md-thread" aria-label="Konuşma">
        <li class="ek-md-msg ek-md-msg--in">
          <span class="ek-md-avatar" aria-hidden="true">{{ customerInitials }}</span>
          <div class="ek-md-bubble">
            <div class="ek-md-meta"><strong>{{ customerName }}</strong><time class="ek-num" :datetime="String(message.date ?? '')">{{ formatDateTime(message.date) }}</time></div>
            <p class="ek-md-text">{{ message.text }}</p>
          </div>
        </li>
        <li v-if="message.answer" class="ek-md-msg ek-md-msg--out" :class="{ 'is-rejected': message.isRejected }">
          <div class="ek-md-bubble">
            <div class="ek-md-meta"><strong>Yanıtınız</strong><time v-if="message.answeredAt" class="ek-num" :datetime="String(message.answeredAt)">{{ formatDateTime(message.answeredAt) }}</time></div>
            <p class="ek-md-text">{{ message.answer }}</p>
          </div>
        </li>
      </ol>

      <section v-if="message.context" class="ek-md-record" aria-label="İlgili kayıt">
        <v-avatar v-if="message.context.imageUrl" rounded="lg" size="48"><v-img :src="message.context.imageUrl" cover alt="" /></v-avatar>
        <EkIconTile v-else :icon="message.context.orderNumber ? 'mdi-cart-outline' : 'mdi-package-variant'" tone="neutral" />
        <div class="ek-md-record__body">
          <span class="ek-md-record__eyebrow">{{ message.context.orderNumber ? 'İlgili sipariş' : 'İlgili ürün' }}</span>
          <span v-if="message.context.productName" class="ek-md-record__title">{{ message.context.productName }}</span>
          <span class="ek-md-muted">
            <template v-if="message.context.orderNumber"><span class="ek-num">Sipariş {{ message.context.orderNumber }}</span></template>
            <template v-if="message.context.productMainId"><template v-if="message.context.orderNumber"> · </template>Model {{ message.context.productMainId }}</template>
          </span>
        </div>
        <EkButton v-if="orderLink && eventBus" tone="ghost" size="sm" trailing-icon="mdi-arrow-right" @click="goOrder">Siparişe git</EkButton>
      </section>

      <section v-if="!(message.status === MessageStatusEnum.ANSWERED && !message.isRejected)" class="ek-md-reply" aria-label="Yanıt yaz">
        <v-textarea v-model="answerText" :label="message.isRejected ? 'Yanıtınızı güncelleyin' : 'Yanıtınız'" rows="4" auto-grow
          class="ek-message-answer"
          :placeholder="message.isRejected ? 'Red gerekçesine göre yanıtınızı düzenleyin…' : 'Müşteriye nazik ve açıklayıcı bir yanıt yazın.'"
          :counter="answerRule ? answerRule.max : true"
          :counter-value="() => answerLength.count"
          :hint="answerHint"
          persistent-hint
          persistent-counter
          :error-messages="answerError"
          @blur="answerTouched = true" />
        <div class="ek-md-reply__actions">
          <EkButton tone="primary" icon="mdi-send-outline" :disabled="!canSend" :loading="loading" @click="submitReply">
            {{ message.isRejected ? 'Güncelle ve gönder' : 'Yanıtı gönder' }}
          </EkButton>
        </div>
      </section>
    </div>

    <EkSkeleton v-else type="detail" />
  </EkDetailSheet>
</template>

<script setup lang="ts">
import { EkAlert, EkDetailSheet, EkSection, EkStatusChip, EkSkeleton, EkButton, EkChannelDot, EkIconTile } from '@entegrasyonik/ui/components'
import { ref, computed, watch } from 'vue';
import { inject } from 'vue';
import { useMenuStore } from '@/stores/site/menu';
import { initials } from '@/components/customer/customerCard';
import { useI18n } from 'vue-i18n';
;
;
;
;
;
;
;
import MessageWaitChip from './MessageWaitChip.vue';
import { answerLengthState, answerRuleFor, isAwaitingReply } from './messageSla';
import { formatDateTime } from '@entegrasyonik/ui/format';
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

const customerName = computed(() => {
  const c = props.message?.customer;
  return [c?.firstName, c?.lastName].filter(Boolean).join(' ') || props.message?.externalUserName || 'Pazaryeri müşterisi';
});
const customerInitials = computed(() => initials(customerName.value.split(' ')[0], customerName.value.split(' ').slice(1).join(' ')) || '?');
// "Siparişe git": kabuğun sekme açma yolu (ShellSearch ile aynı) — sipariş numarasıyla aramalı sipariş listesi.
const eventBus: any = inject('eventBus', null);
const menuStore: any = useMenuStore();
const orderLink = computed(() => (props.message?.context?.orderNumber ? menuStore?.getMenuLinkWithTitle?.('orderList') : undefined));
function goOrder() {
  const link = orderLink.value;
  if (!eventBus || !link) return;
  eventBus.emit('openTab', { ...link, parameters: { globalSearch: props.message?.context?.orderNumber } });
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
.ek-md {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}

.ek-md-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
}

.ek-md-type {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-md-muted {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-md-thread {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  margin: 0;
  padding: var(--ek-space-5);
  list-style: none;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-sunken);
}

.ek-md-msg {
  display: flex;
  align-items: flex-end;
  gap: var(--ek-space-3);
  max-width: min(100%, 560px);
}

.ek-md-msg--out {
  align-self: flex-end;
}

.ek-md-avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-default);
}

.ek-md-bubble {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card) var(--ek-radius-card) var(--ek-radius-card) var(--ek-radius-sm);
  background: var(--ek-color-surface);
  min-width: 0;
}

.ek-md-msg--out .ek-md-bubble {
  border-color: var(--ek-color-action-border);
  border-radius: var(--ek-radius-card) var(--ek-radius-card) var(--ek-radius-sm) var(--ek-radius-card);
  background: var(--ek-color-action-subtle);
}

.ek-md-msg--out.is-rejected .ek-md-bubble {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
}

.ek-md-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-3);
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.ek-md-meta strong {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-md-text {
  margin: 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-default);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.ek-md-record {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-md-record__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ek-md-record__eyebrow {
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-md-record__title {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}

.ek-md-reply {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.ek-md-reply__actions {
  display: flex;
  justify-content: flex-end;
}

.ek-message-answer :deep(.v-counter) {
  font-variant-numeric: tabular-nums;
}
</style>
