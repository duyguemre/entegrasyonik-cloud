<!--
  frontend/src/components/definitions/LegacyDefinitionRowDialogs.vue

  fe-r4d D5 — eski tanım ekranlarının (definitions/*DefinitionView, Ürün HARİÇ) satır eylemi diyalogları.
  Düzenle: EkFormDialog (iki kolon; Enter kaydeder, Esc kapatır; alan altında hata metni). Sil: EkConfirmDialog (danger,
  varsayılan odak Vazgeç). Durum ve kurallar `legacyDefinitionRows.ts`'te; bu bileşen yalnız çizer ve bildirim verir.
-->
<template>
  <EkFormDialog v-model="editing.open" title="Satırı düzenle" icon="mdi-pencil-outline" :columns="2" :attach="attach"
    description="Örnek kayıt bu sekmede güncellenir." @submit="onSave" @cancel="editing.open = false">
    <template v-if="editing.draft">
      <v-text-field v-model="editing.draft.name" label="Ad *" autofocus data-legacy-field="name"
        :error-messages="editing.errors.name ? [editing.errors.name] : []" />
      <v-text-field v-model="editing.draft.email" label="E-posta" type="email" data-legacy-field="email"
        :error-messages="editing.errors.email ? [editing.errors.email] : []" />
      <v-text-field v-model="editing.draft.phone" label="Telefon" type="tel" data-legacy-field="phone" />
      <v-text-field v-model="editing.draft.desc" label="Adres" data-legacy-field="desc" />
      <v-text-field v-model="editing.draft.county" label="İlçe" />
      <v-text-field v-model="editing.draft.state" label="İl" />
      <v-text-field v-model="editing.draft.country" label="Ülke" />
      <v-switch v-model="editing.draft.isCompany" label="Kurumsal" color="primary" hide-details inset />
      <template v-if="editing.draft.isCompany">
        <v-text-field v-model="editing.draft.taxId" label="Vergi no" />
        <v-text-field v-model="editing.draft.taxIssuer" label="Vergi dairesi" />
      </template>
      <v-text-field v-else v-model="editing.draft.tc" label="T.C. kimlik no" />
    </template>
  </EkFormDialog>

  <EkConfirmDialog v-model="deleting.open" danger icon="mdi-trash-can-outline" confirm-label="Sil" :attach="attach"
    :title="`'${deleting.row?.customer.name ?? ''}' satırı silinsin mi?`"
    description="Satır bu listeden kaldırılır." @confirm="onDelete" />
</template>

<script setup lang="ts">
import { EkConfirmDialog, EkFormDialog } from '@entegrasyonik/ui/components'
import { useSnackbarStore } from '@/stores/snackbarStore'
import type { LegacyDefinitionRowsController } from './legacyDefinitionRows'

const props = withDefaults(defineProps<{ rows: LegacyDefinitionRowsController; attach?: string | boolean | Element }>(), { attach: false })
// Durum nesneleri denetleyiciye aittir (reaktif); diyaloglar doğrudan onlara bağlanır.
const { editing, deleting } = props.rows

const snackbarStore = useSnackbarStore()

const onSave = () => {
  if (props.rows.saveEdit()) snackbarStore.addSnackbar({ show: true, text: 'Satır güncellendi', timeout: 2000, color: 'success' })
}

const onDelete = () => {
  if (props.rows.confirmDelete()) snackbarStore.addSnackbar({ show: true, text: 'Satır silindi', timeout: 2000, color: 'success' })
}
</script>
