<template>
  <ActionDialogComponent :model-value="modelValue" @update:model-value="val => $emit('update:modelValue', val)"
    title="YENİ DESTEK TALEBİ" subtitle="Size nasıl yardımcı olabiliriz? Lütfen detayları paylaşın."
    icon="mdi-plus-circle-outline" color="passiveColor" confirm-text="Talebi Gönder" :loading="loading"
    attach="ticketListView" @confirm="handleConfirm" @cancel="$emit('update:modelValue', false)" maxWidth="600px">
    <v-form ref="formRef" class="pa-4">
      <v-row dense>
        <v-col cols="12">
          <v-text-field v-model="formData.subject" label="Konu" variant="outlined" density="compact"
            placeholder="Kısaca sorununuzu belirtin" :rules="[v => !!v || 'Konu zorunludur']"
            class="customTextField mb-2"></v-text-field>
        </v-col>

        <v-col cols="12" sm="6">
          <v-select v-model="formData.type" :items="typeOptions" item-title="title" item-value="id" label="Talep Tipi"
            variant="outlined" density="compact" class="customTextField"></v-select>
        </v-col>

        <v-col cols="12" sm="6">
          <v-select v-model="formData.priority" :items="priorityOptions" item-title="title" item-value="id"
            label="Öncelik" variant="outlined" density="compact" class="customTextField">
            <template v-slot:item="{ props, item }">
              <v-list-item v-bind="props">
                <template #prepend>
                  <v-icon :color="item.raw.color" size="small" class="mr-2">mdi-circle</v-icon>
                </template>
              </v-list-item>
            </template>
          </v-select>
        </v-col>

        <v-col cols="12">
          <v-textarea v-model="formData.message" label="Mesajınız" variant="outlined"
            placeholder="Sorununuzu veya talebinizi detaylıca açıklayın..."
            :rules="[v => !!v || 'Mesaj alanı zorunludur']" rows="5" counter class="customTextField"></v-textarea>
        </v-col>
      </v-row>
    </v-form>
  </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
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
