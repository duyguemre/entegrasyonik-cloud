<template>
  <!-- ek-pattern-exception: EkFormDialog — 2 başlıklı bölüme ayrılmış 5 alanlı form (Karar 3.7
       "uzun formlar başlıklı bölümlere ayrılır"), EkFormDialog'un "≤5 alan, bölümsüz" sözleşmesini
       aşıyor; gerçekten farklı bir etkileşim modeli. `ActionDialogComponent` (confirmText/cancelText
       özelleştirilebilir) KORUNDU, yalnızca token'lara bağlandı. -->
  <ActionDialogComponent :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)"
    title="Yeni Mağaza Oluştur" subtitle="Sisteme yeni bir dükkan ve yönetici hesabı tanımlayın" icon="mdi-store-plus-outline"
    color="primary" maxWidth="800px" showFooter confirmText="Mağaza oluştur" cancelText="Vazgeç"
    confirmButtomColor="primary" :isLoading="saving" @confirm="save" @cancel="$emit('close')" @close="$emit('close')"
    attach=".adminClientListView">

    <div class="pa-0">
      <v-row>
        <!-- Basic Info -->
        <v-col cols="12">
          <v-card flat border class="pa-5 border-subtle mb-4 bg-slate-50">
            <div class="section-overline mb-4">Mağaza temel bilgileri</div>
            <v-row>
              <v-col cols="12" md="6">
                <v-text-field v-model="form.name" label="Mağaza Adı" hide-details placeholder="Örn: Trendyol Mağazam"></v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="form.title" label="Mağaza Başlığı" hide-details placeholder="Örn: MyStore E-Ticaret"></v-text-field>
              </v-col>
            </v-row>
          </v-card>
        </v-col>

        <!-- Administrator User Info -->
        <v-col cols="12">
          <v-card flat border class="pa-5 border-subtle mb-4 bg-slate-50">
            <div class="section-overline mb-4">Yönetici hesabı (owner)</div>
            <v-row>
              <v-col cols="12" md="4">
                <v-text-field v-model="userForm.fullName" label="Ad Soyad" hide-details placeholder="Yönetici Adı"></v-text-field>
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model="userForm.email" label="E-Posta Adresi" hide-details placeholder="admin@magaza.com"></v-text-field>
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model="userForm.password" label="Giriş Şifresi" type="password" hide-details></v-text-field>
              </v-col>
            </v-row>
          </v-card>
        </v-col>

        <!-- Default Storage Settings (Pre-filled) -->
        <v-col cols="12">
          <div class="storage-note mb-2 px-2">
            Varsayılan depolama (R2) ayarları otomatik olarak atanacaktır. Daha sonra ayarlardan güncelleyebilirsiniz.
          </div>
        </v-col>
      </v-row>
    </div>
  </ActionDialogComponent>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
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

<style scoped lang="scss">
.bg-slate-50 {
  background-color: var(--ek-color-surface-muted) !important;
}

.border-subtle {
  border: 1px solid var(--ek-color-border-default) !important;
}

// Karar 1.2 — bölüm başlığı "üst etiket" (overline) stilindedir: xs 12/600, harf aralığı, muted.
.section-overline {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  color: var(--ek-color-content-muted);
}

.storage-note {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}
</style>
