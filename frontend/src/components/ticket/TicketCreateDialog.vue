<!--
  frontend/src/components/ticket/TicketCreateDialog.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN (bkz. e2e/specs/support-tickets.spec.ts). Form mantığı (`formData`,
  `handleConfirm`, `@confirm` sözleşmesi) DEĞİŞMEDİ; yalnızca legacy `customTextField` sınıfı
  kaldırıldı (global Vuetify `defaults`, A1, zaten outlined/compact/primary uyguluyor).
-->
<template>
  <ActionDialogComponent :model-value="modelValue" @update:model-value="val => $emit('update:modelValue', val)"
    title="Yeni destek talebi" subtitle="Size nasıl yardımcı olabiliriz? Lütfen detayları paylaşın."
    icon="mdi-plus-circle-outline" color="primary" confirm-text="Talebi Gönder" :loading="loading"
    attach="ticketListView" @confirm="handleConfirm" @cancel="$emit('update:modelValue', false)" maxWidth="600px">
    <v-form ref="formRef">
      <EkFormGrid :columns="2">
          <v-text-field class="ek-span-full" v-model="formData.subject" label="Konu"
            placeholder="Kısaca sorununuzu belirtin" :rules="[v => !!v || 'Konu zorunludur']"
></v-text-field>
          <v-select v-model="formData.type" :items="typeOptions" item-title="title" item-value="id" label="Talep Tipi"></v-select>
          <v-select v-model="formData.priority" :items="priorityOptions" item-title="title" item-value="id"
            label="Öncelik">
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props">
                <template #prepend>
                  <v-icon :color="item.raw.color" size="small" class="mr-2">mdi-circle</v-icon>
                </template>
              </v-list-item>
            </template>
          </v-select>
          <v-textarea class="ek-span-full" v-model="formData.message" label="Mesajınız"
            placeholder="Sorununuzu veya talebinizi detaylıca açıklayın..."
            :rules="[v => !!v || 'Mesaj alanı zorunludur']" rows="5" counter></v-textarea>
      </EkFormGrid>
    </v-form>
  </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import EkFormGrid from '@/components/ds/EkFormGrid.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import { TicketTypeEnum, TicketPriorityEnum, TICKET_TYPE_LABELS, TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS } from '@/types/TicketTypes';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'confirm']);

const formRef = ref<any>(null);
const formData = reactive({
  subject: '',
  type: TicketTypeEnum.GENERAL,
  priority: TicketPriorityEnum.MEDIUM,
  message: ''
});

const typeOptions = Object.values(TicketTypeEnum).map(t => ({
  id: t,
  title: TICKET_TYPE_LABELS[t as TicketTypeEnum]
}));

const priorityOptions = Object.values(TicketPriorityEnum).map(p => ({
  id: p,
  title: TICKET_PRIORITY_LABELS[p as TicketPriorityEnum],
  color: TICKET_PRIORITY_COLORS[p as TicketPriorityEnum]
}));

const handleConfirm = async () => {
  const { valid } = await formRef.value.validate();
  if (valid) {
    emit('confirm', { ...formData });
    // Reset form
    Object.assign(formData, {
      subject: '',
      type: TicketTypeEnum.GENERAL,
      priority: TicketPriorityEnum.MEDIUM,
      message: ''
    });
  }
};
</script>
