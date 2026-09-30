<!-- Parça türü → bileşen. Bilinmeyen tür (ileri uyum) → PartUnknown. -->
<template>
  <component :is="component" :part="part" :message-id="messageId" />
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import { isKnownPart, type Part, type UnknownPart } from '../../protocol/v1'
import PartConfirm from './PartConfirm.vue'
import PartEntityLink from './PartEntityLink.vue'
import PartError from './PartError.vue'
import PartForm from './PartForm.vue'
import PartKpi from './PartKpi.vue'
import PartProgress from './PartProgress.vue'
import PartTable from './PartTable.vue'
import PartText from './PartText.vue'
import PartUnknown from './PartUnknown.vue'

const props = defineProps<{ part: Part | UnknownPart; messageId: string }>()

const MAP: Record<Part['type'], Component> = {
  text: PartText,
  table: PartTable,
  kpi: PartKpi,
  confirm: PartConfirm,
  progress: PartProgress,
  error: PartError,
  'entity-link': PartEntityLink,
  form: PartForm,
}

const component = computed<Component>(() => (isKnownPart(props.part) ? MAP[props.part.type] : PartUnknown))
</script>
