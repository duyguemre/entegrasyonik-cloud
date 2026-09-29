<template>
  <ActionDialogComponent :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)"
    title="Yeni Mağaza Oluştur" subtitle="Sisteme yeni bir dükkan ve yönetici hesabı tanımlayın" icon="mdi-store-plus-outline"
    color="primary" maxWidth="800px" showFooter confirmText="MAĞAZA OLUŞTUR" cancelText="İPTAL"
    confirmButtomColor="primary" :isLoading="saving" @confirm="save" @cancel="$emit('close')" @close="$emit('close')"
    attach=".adminClientListView">

    <EkFormSection title="Mağaza temel bilgileri" icon="mdi-store-outline">
      <v-text-field v-model="form.name" label="Mağaza Adı" placeholder="Örn: Trendyol Mağazam" />
      <v-text-field v-model="form.title" label="Mağaza Başlığı" placeholder="Örn: MyStore E-Ticaret" />
    </EkFormSection>

    <EkFormSection title="Yönetici hesabı (owner)" icon="mdi-account-key-outline" :columns="3">
      <v-text-field v-model="userForm.fullName" label="Ad Soyad" placeholder="Yönetici Adı" />
      <v-text-field v-model="userForm.email" label="E-Posta Adresi" placeholder="admin@magaza.com" />
      <v-text-field v-model="userForm.password" label="Giriş Şifresi" type="password" />
    </EkFormSection>

    <p class="acc-footnote">
      <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
      Varsayılan depolama (R2) ayarları otomatik olarak atanacaktır. Daha sonra ayarlardan güncelleyebilirsiniz.
    </p>
  </ActionDialogComponent>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import EkFormSection from '@/components/ds/EkFormSection.vue'
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';

const props = defineProps({
  modelValue: { type: Boolean, required: true }
});

const emit = defineEmits(['update:modelValue', 'close', 'refresh']);

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();
const saving = ref(false);

// ADR-0003: depolama (archive/image) ve dbConfig alanları ARTIK istemciden gönderilmez; sunucu (TenantProvisioningService) belirler.
// (Eskiden R2 erişim anahtarları bu dosyada gömülüydü ve tarayıcı paketine giriyordu — kaldırıldı.)
const form = reactive({
  name: '',
  title: ''
});

const userForm = reactive({
  fullName: '',
  email: '',
  password: ''
});

async function save() {
  if (!form.name || !userForm.email || !userForm.password) {
    snackbarStore.addSnackbar({ text: 'Lütfen gerekli tüm alanları doldurunuz.', color: 'warning' });
    return;
  }

  saving.value = true;
  try {
    const res = await restApi.post('AdminService/createClient', {
      clientData: form,
      userData: userForm
    });
    if (res?.success) {
      snackbarStore.addSnackbar({ text: 'Yeni mağaza başarıyla oluşturuldu.', color: 'success' });
      emit('refresh');
      emit('close');
      reset();
    }
  } catch (e: any) {
    snackbarStore.addSnackbar({ text: e.message || 'Mağaza oluşturma hatası!', color: 'error' });
  } finally {
    saving.value = false;
  }
}

function reset() {
  form.name = '';
  form.title = '';
  userForm.fullName = '';
  userForm.email = '';
  userForm.password = '';
}

watch(() => props.modelValue, (val) => {
  if (!val) reset();
});
</script>

<style scoped>
.acc-footnote {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: var(--ek-space-5) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
</style>
