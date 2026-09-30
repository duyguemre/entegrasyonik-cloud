<!--
  GuardedDialog — `useGuardedAction` ile bo-p1 `DangerActionDialog` (BO_UI_PATTERNS §6) bağı. Diyalog dört soruyu yanıtlar:
  Ne olacak (items[0] + ayrıntılar) · Geri alınabilir mi · Etkilenen (tenant/scope) · Kimlik doğrulama; ardından gerekçe
  (≥10, ≤500). Sunucu hatası "<ne oldu> — <ne yapılmalı>" olarak alanın altında kalır (423 salt-okuma dahil).
  Varsayılan slot: işleme özgü alanlar (gün sayısı, hedef plan, e-posta).
-->
<template>
  <DangerActionDialog
    :model-value="action.isOpen.value"
    :title="title"
    :description="description"
    :icon="icon"
    :action="items?.[0] ?? description ?? title"
    :details="items?.slice(1)"
    :reversible="reversible || (!danger && !irreversible)"
    :reversible-note="reversibleNote"
    :tenant="tenant"
    :scope="scope"
    :destructive="danger"
    :confirm-label="confirmLabel"
    :confirm-icon="confirmIcon"
    :busy="action.busy.value"
    :blocked="confirmDisabled"
    :error="action.error.value?.message ?? ''"
    @update:model-value="(v: boolean) => (v ? undefined : action.close())"
    @confirm="action.confirm"
  >
    <slot />
  </DangerActionDialog>
</template>

<script setup lang="ts" generic="C, R">
import DangerActionDialog from '@bo/components/shell/DangerActionDialog.vue'
import type { GuardedAction } from '@bo/composables/useGuardedAction'

withDefaults(
  defineProps<{
    action: GuardedAction<C, R>
    title: string
    description?: string
    icon?: string
    /** İlk madde "Ne olacak", diğerleri ayrıntı. */
    items?: string[]
    /** Varsayılan: yıkıcı olmayan işlem geri alınabilir sayılır; `irreversible` / `reversible` ile açıkça belirtin. */
    reversible?: boolean
    irreversible?: boolean
    reversibleNote?: string
    tenant?: { tid: number; name: string }
    scope?: string
    confirmLabel?: string
    confirmIcon?: string
    danger?: boolean
    /** Ek alanlar geçersizken onayı kapatır. */
    confirmDisabled?: boolean
    width?: 'sm' | 'md' | 'lg'
  }>(),
  { danger: false, confirmDisabled: false, width: 'md', confirmLabel: 'Gerekçeyle onayla', confirmIcon: 'mdi-check' },
)
</script>
