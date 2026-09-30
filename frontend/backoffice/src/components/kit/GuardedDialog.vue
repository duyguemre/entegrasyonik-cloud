<!--
  GuardedDialog — `useGuardedAction` + EkReasonDialog bağı: gerekçe (10..500) + step-up bilgisi + sunucu hatası
  ("<ne oldu> — <ne yapılmalı>"). Salt-okuma kipinde (423) hata bandı kalıcıdır; kullanıcı diyaloğu kapatabilir.
-->
<template>
  <EkReasonDialog
    :model-value="action.isOpen.value"
    :title="title"
    :description="description"
    :icon="icon"
    :items="items"
    :confirm-label="confirmLabel"
    :confirm-icon="confirmIcon"
    :danger="danger"
    step-up
    :busy="action.busy.value"
    :error="action.error.value?.message ?? null"
    :confirm-disabled="confirmDisabled"
    :width="width"
    @update:model-value="(v: boolean) => (v ? undefined : action.close())"
    @cancel="action.close()"
    @confirm="action.confirm"
  >
    <slot />
  </EkReasonDialog>
</template>

<script setup lang="ts" generic="C, R">
import { EkReasonDialog } from '@entegrasyonik/ui/components'
import type { GuardedAction } from '@bo/composables/useGuardedAction'

withDefaults(
  defineProps<{
    action: GuardedAction<C, R>
    title: string
    description?: string
    icon?: string
    items?: string[]
    confirmLabel?: string
    confirmIcon?: string
    danger?: boolean
    confirmDisabled?: boolean
    width?: 'sm' | 'md' | 'lg'
  }>(),
  { danger: false, confirmDisabled: false, width: 'md' },
)
</script>
