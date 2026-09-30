<!-- Kayıt kartı: uygulama bağlantısının TEK yolu (markdown bağlantısı yoktur). `resolveLink → null` ise tıklanamaz. -->
<template>
  <article class="ek-chat-entity" :aria-labelledby="titleId">
    <header class="ek-chat-entity__head">
      <EkIconTile :icon="icon" size="sm" tone="neutral" />
      <div class="ek-chat-entity__heading">
        <p class="ek-chat-entity__type">{{ typeLabel }}</p>
        <p :id="titleId" class="ek-chat-entity__title">
          <a v-if="target" class="ek-chat-link" :href="target.href" @click.prevent="open">{{ part.entity.label }}</a>
          <span v-else>{{ part.entity.label }}</span>
        </p>
      </div>
      <EkButton v-if="target" class="ek-chat-entity__open" size="sm" tone="secondary" trailing-icon="mdi-arrow-right" :aria-label="`${t('entity.open')}: ${part.entity.label}`" @click="open">{{ t('entity.open') }}</EkButton>
    </header>
    <p v-if="part.description" class="ek-chat-entity__desc">{{ part.description }}</p>
    <dl v-if="part.fields?.length" class="ek-chat-entity__fields">
      <div v-for="(f, i) in part.fields" :key="i" class="ek-chat-entity__field">
        <dt>{{ f.label }}</dt>
        <dd>
          <EkStatusChip v-if="f.type === 'status'" v-bind="statusOf(f.statusDomain, f.value)" />
          <template v-else>{{ formatField(f.value, f.type, defaults) }}</template>
        </dd>
      </div>
    </dl>
  </article>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { EkButton, EkIconTile, EkStatusChip } from '@entegrasyonik/ui/components'
import type { EntityLinkPart } from '../../protocol/v1'
import { useChat } from '../../state/useChat'
import { formatField } from '../cellFormat'
import { ENTITY_ICON } from '../icons'

const props = defineProps<{ part: EntityLinkPart; messageId?: string }>()
const chat = useChat()
const { t } = chat
const titleId = `ek-chat-entity-${useId()}`
const defaults = computed(() => chat.host.formatDefaults())
const icon = computed(() => ENTITY_ICON[props.part.entity.type] ?? 'mdi-file-outline')
const typeLabel = computed(() => t(`entity.type.${props.part.entity.type}`))
const target = computed(() => chat.host.resolveLink(props.part.link))

function statusOf(domain: string | undefined, value: string) {
  const mapped = domain ? chat.host.status?.(domain, value) : null
  return mapped ?? { tone: 'neutral' as const, label: value }
}

function open() {
  chat.host.track?.({ name: 'chat.link', entity: props.part.entity.type })
  target.value?.open()
}
</script>
