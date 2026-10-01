<!--
  Onay kartı (ADR-0034 Karar 4.4; CHAT_UI_CONTRACT.md §8): ne olacak (özet), etkilenen kayıtlar, alan farkları, risk ve
  dış sisteme gidip gitmediği, zaman aşımı geri sayımı, onayla/reddet. Yazma yalnız bu karttaki tıklamayla ayrı uca
  (`transport.confirm`) gider — model bu kanala erişemez.
  Erişilebilirlik: role="group" + aria-labelledby; `awaiting-confirm`'de odak KART BAŞLIĞINA (onay düğmesine değil);
  geri sayım görsel, ekran okuyucuya son 30 sn'de BİR kez duyurulur; `typed` kipte eşleşmeden onay pasif + nedeni describedby.
-->
<template>
  <section
    class="ek-chat-confirm"
    :class="[`is-${part.state}`, `is-${part.effect}`, `is-risk-${part.risk}`]"
    role="group"
    :aria-labelledby="titleId"
    :aria-describedby="summaryId"
  >
    <header class="ek-chat-confirm__head">
      <EkIconTile :icon="part.effect === 'destructive' ? 'mdi-delete-alert-outline' : 'mdi-shield-check-outline'" size="sm" :tone="part.effect === 'destructive' ? 'error' : 'action'" />
      <div class="ek-chat-confirm__heading">
        <h3 :id="titleId" ref="titleRef" class="ek-chat-confirm__title" tabindex="-1">{{ part.title }}</h3>
        <div class="ek-chat-confirm__chips">
          <EkStatusChip :tone="part.effect === 'destructive' ? 'danger' : 'info'" :label="t(`confirm.effect.${part.effect}`)" />
          <EkStatusChip :tone="riskTone" :label="t(`confirm.risk.${part.risk}`)" />
        </div>
      </div>
    </header>

    <p :id="summaryId" class="ek-chat-confirm__summary">{{ part.summary }}</p>

    <!-- P-MCP-2: gövde (dış sistem notu + etkilenen kayıtlar) MCP işlem onayıyla ortak bileşen. -->
    <ConfirmBody
      :external="part.external"
      :external-text="t('confirm.external')"
      :label="part.affected.count > 0 ? t('confirm.affected', { count: formatNumber(part.affected.count) }) : ''"
      :items="part.affected.count > 0 ? part.affected.sample.map((ref) => ({ key: `${ref.type}:${ref.id}`, label: ref.label, icon: ENTITY_ICON[ref.type] })) : []"
      :more-text="part.affected.count > 0 && hiddenCount > 0 ? t('confirm.affectedMore', { count: formatNumber(hiddenCount) }) : ''"
    />

    <div v-if="part.changes?.length" class="ek-chat-confirm__block">
      <table class="ek-chat-confirm__changes">
        <caption class="ek-chat-confirm__label">{{ t('confirm.changes') }}</caption>
        <thead class="ek-chat-sr-only">
          <tr>
            <th scope="col">{{ t('confirm.field') }}</th>
            <th scope="col">{{ t('confirm.from') }}</th>
            <th scope="col">{{ t('confirm.to') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, i) in part.changes" :key="i">
            <th scope="row">{{ c.label }}</th>
            <td class="is-from">{{ c.from ?? '—' }}</td>
            <td class="is-to"><v-icon icon="mdi-arrow-right" size="x-small" aria-hidden="true" /> {{ c.to }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <template v-if="part.state === 'pending'">
      <div v-if="part.confirmMode === 'typed'" class="ek-chat-confirm__typed">
        <v-text-field
          :id="inputId"
          v-model="typed"
          :label="t('confirm.typedLabel', { phrase: part.typedPhrase })"
          autocomplete="off"
          spellcheck="false"
          density="compact"
          hide-details
          :aria-describedby="mismatchId"
          :error="typed.length > 0 && !typedMatches"
        />
        <p :id="mismatchId" class="ek-chat-confirm__hint" :class="{ 'is-error': typed.length > 0 && !typedMatches }">{{ t('confirm.typedMismatch', { phrase: part.typedPhrase }) }}</p>
      </div>

      <footer class="ek-chat-confirm__foot">
        <span class="ek-chat-confirm__timer" :class="{ 'is-soon': remainingMs <= 30000 }" aria-hidden="true">
          <v-icon icon="mdi-timer-outline" size="x-small" />
          {{ t('confirm.expiresIn', { time: formatCountdown(remainingMs) }) }}
        </span>
        <span class="ek-chat-sr-only" aria-live="polite">{{ soonAnnouncement }}</span>
        <div class="ek-chat-confirm__actions">
          <EkButton tone="secondary" size="sm" :disabled="!actionable" @click="chat.reject(part)">{{ t('confirm.reject') }}</EkButton>
          <EkButton
            :tone="part.effect === 'destructive' ? 'danger' : 'primary'"
            size="sm"
            :icon="part.effect === 'destructive' ? 'mdi-delete-outline' : 'mdi-check'"
            :disabled="!actionable || !typedMatches"
            :aria-describedby="typedMatches ? undefined : mismatchId"
            @click="chat.approve(part, part.confirmMode === 'typed' ? typed : undefined)"
          >
            {{ part.title }}
          </EkButton>
        </div>
      </footer>
    </template>

    <div v-else class="ek-chat-confirm__outcome" :class="`is-${part.state}`" role="status">
      <ChatSpinner v-if="part.state === 'executing'" />
      <v-icon v-else :icon="outcomeIcon" size="small" aria-hidden="true" />
      <div>
        <p class="ek-chat-confirm__outcome-title">{{ t(`confirm.state.${part.state}`) }}</p>
        <p v-if="part.result?.message" class="ek-chat-confirm__outcome-body">{{ part.result.message }}</p>
      </div>
      <EkButton v-if="resultTarget" class="ek-chat-confirm__outcome-action" size="sm" tone="ghost" trailing-icon="mdi-arrow-right" @click="openResult">{{ t('confirm.openResult') }}</EkButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { EkButton, EkIconTile, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import type { ConfirmPart } from '../../protocol/v1'
import { useChat } from '../../state/useChat'
import ConfirmBody from './ConfirmBody.vue'
import { formatCountdown } from '../cellFormat'
import { ENTITY_ICON } from '../icons'
import ChatSpinner from '../ChatSpinner.vue'

const props = defineProps<{ part: ConfirmPart; messageId?: string }>()
const chat = useChat()
const { t } = chat
const uid = useId()
const titleId = `ek-chat-confirm-${uid}`
const summaryId = `${titleId}-summary`
const inputId = `${titleId}-typed`
const mismatchId = `${titleId}-mismatch`
const titleRef = ref<HTMLElement | null>(null)
const typed = ref('')

const riskTone = computed(() => (props.part.risk === 'high' ? 'danger' : props.part.risk === 'medium' ? 'warning' : 'neutral'))
const hiddenCount = computed(() => Math.max(0, props.part.affected.count - props.part.affected.sample.length))
const typedMatches = computed(() => props.part.confirmMode !== 'typed' || typed.value === props.part.typedPhrase)
const actionable = computed(() => chat.status.value === 'awaiting-confirm')
const outcomeIcon = computed(
  () => ({ done: 'mdi-check-circle-outline', rejected: 'mdi-close-circle-outline', expired: 'mdi-timer-off-outline', failed: 'mdi-alert-circle-outline' })[props.part.state as 'done'] ?? 'mdi-information-outline',
)
const resultTarget = computed(() => (props.part.result?.openIn ? chat.host.resolveLink(props.part.result.openIn) : null))

// ---- geri sayım (saniyelik; yalnız pending iken) ----
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
const remainingMs = computed(() => Date.parse(props.part.expiresAt) - now.value)
/** Son 30 sn'de ekran okuyucuya BİR kez duyurulur; metin o an sabitlenir (her saniye yeniden okunmaz). */
const soonAnnouncement = ref('')

function tick() {
  now.value = Date.now()
  if (!soonAnnouncement.value && remainingMs.value <= 30000 && remainingMs.value > 0) {
    soonAnnouncement.value = t('confirm.expiringSoon', { seconds: Math.ceil(remainingMs.value / 1000) })
  }
}

watch(
  () => props.part.state,
  (state) => {
    if (timer) clearInterval(timer)
    timer = null
    if (state === 'pending') {
      tick()
      timer = setInterval(tick, 1000)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => timer && clearInterval(timer))

// ---- odak: awaiting-confirm'de kart başlığına (yanlışlıkla Enter ile onayı önler) ----
watch(
  () => chat.focusRequest.value,
  async (req) => {
    if (req?.target !== 'confirm' || props.part.state !== 'pending') return
    await nextTick()
    titleRef.value?.focus()
  },
)

function openResult() {
  chat.host.track?.({ name: 'chat.link', entity: 'screen' })
  resultTarget.value?.open()
}
</script>
