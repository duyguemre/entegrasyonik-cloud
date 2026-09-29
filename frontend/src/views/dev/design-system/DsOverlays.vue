<!-- Vitrin §9 — diyalog (normal + tehlikeli) ve bağlam menüsü (ikonlu, gruplu, ayraçlı, kısayollu). -->
<template>
  <div class="ds-overlay-grid">
    <DsSpecimen title="Diyalog — form" note="Başlık bandı · içerik · eylem çubuğu. Enter gönderir, Esc kapatır." canvas>
      <EkDialog inline title="Kargo bilgisini güncelle" description="TY-102348 · Trendyol" icon="mdi-truck-outline" confirm-label="Güncelle" confirm-icon="mdi-check">
        <EkFormGrid :columns="2">
          <v-select label="Kargo firması" :items="['Yurtiçi Kargo', 'Aras Kargo']" model-value="Yurtiçi Kargo" />
          <v-text-field label="Takip numarası *" model-value="YK1029384756" aria-required="true" />
          <v-text-field class="ek-span-2" label="Not" placeholder="Müşteriye görünmez" />
        </EkFormGrid>
        <template #actions-start><EkButton tone="ghost" size="sm" icon="mdi-history">Geçmiş</EkButton></template>
      </EkDialog>
    </DsSpecimen>
    <DsSpecimen title="Diyalog — tehlikeli aksiyon" note="error tonuyla ayrışır; başlık soru cümlesi, nesne adı açık yazılır, varsayılan odak Vazgeç." canvas>
      <EkDialog
        inline
        tone="danger"
        width="sm"
        title="'Pamuklu Oversize Tişört' silinsin mi?"
        description="Ürün 3 pazaryerindeki listelemelerden de kaldırılır. Bu işlem geri alınamaz."
        icon="mdi-delete-alert-outline"
        confirm-label="Ürünü sil"
        confirm-icon="mdi-delete-outline"
      >
        <p class="ds-danger-note"><v-icon icon="mdi-information-outline" aria-hidden="true" /> Stok ve sipariş geçmişi raporlarda kalır.</p>
      </EkDialog>
    </DsSpecimen>
  </div>

  <div class="ds-overlay-grid">
    <DsSpecimen title="Bağlam menüsü (EkMenuPanel)" note="Gruplar mikro başlıklı, aralarında ayraç; tehlikeli öğe en sonda. ↑↓ gezin · Enter seç · Esc kapat." canvas>
      <div class="ds-menu-static">
        <EkMenuPanel :groups="rowMenu" label="Sipariş işlemleri (örnek)" force-hover-key="new-tab" />
      </div>
    </DsSpecimen>
    <DsSpecimen title="Canlı deneme" note="Gerçek overlay bileşenleri: klavye ile açıp gezinebilirsiniz.">
      <div class="ds-live">
        <EkContextMenu :groups="rowMenu" label="Sipariş işlemleri" @select="(i) => (last = i.label)">
          <template #activator="{ props }">
            <EkButton v-bind="props" tone="secondary" icon="mdi-dots-horizontal">Satır menüsü</EkButton>
          </template>
        </EkContextMenu>
        <EkButton tone="secondary" icon="mdi-open-in-app" @click="formOpen = true">Form diyaloğu aç</EkButton>
        <EkButton tone="secondary" icon="mdi-alert-outline" @click="dangerOpen = true">Tehlikeli diyalog aç</EkButton>
        <p class="ds-live__last" role="status">Son seçim: {{ last || '—' }}</p>
      </div>
      <EkDialog v-model="formOpen" title="Kargo bilgisini güncelle" icon="mdi-truck-outline" confirm-label="Güncelle" @confirm="formOpen = false">
        <EkFormGrid :columns="2">
          <v-select label="Kargo firması" :items="['Yurtiçi Kargo', 'Aras Kargo']" model-value="Yurtiçi Kargo" />
          <v-text-field label="Takip numarası" />
        </EkFormGrid>
      </EkDialog>
      <EkDialog
        v-model="dangerOpen"
        tone="danger"
        width="sm"
        title="'Pamuklu Oversize Tişört' silinsin mi?"
        description="Bu işlem geri alınamaz."
        icon="mdi-delete-alert-outline"
        confirm-label="Ürünü sil"
        @confirm="dangerOpen = false"
      />
    </DsSpecimen>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import DsSpecimen from './DsSpecimen.vue'
import EkDialog from '@/components/ds/EkDialog.vue'
import EkFormGrid from '@/components/ds/EkFormGrid.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkMenuPanel from '@/components/ds/EkMenuPanel.vue'
import EkContextMenu from '@/components/ds/EkContextMenu.vue'
import { rowMenu } from './demoData'

const formOpen = ref(false)
const dangerOpen = ref(false)
const last = ref('')
</script>

<style scoped>
.ds-overlay-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: var(--ek-space-4);
}

.ds-danger-note {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-menu-static {
  max-width: 320px;
}

.ds-live {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.ds-live__last {
  flex-basis: 100%;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
</style>
