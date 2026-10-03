<!--
  frontend/src/components/productDefinitions/variants/ProductDetailsComponent.vue

  Ürün formu — DETAY BİLGİLER adımı. Tüm alanlar isteğe bağlıdır; boş bırakılan alanda Ayarlar'daki varsayılan kullanılır.
  Sunum (yeniden tasarım): her alan bir AYAR SATIRI — solda ad + ne işe yaradığı, sağda birimli giriş; satırın altında
  durum: "Varsayılan kullanılıyor: 3 gün" ya da "Özel değer" + "Varsayılana dön". Etiket alanın içinde değil solda,
  `<label for>` ile bağlı (erişilebilir ad aynı). KDV: hızlı oran seçimi (%1 · %10 · %20) + diğer oranlar listesi.
  Alanlar yalnız sayı kabul eder (eskiden harf de geçiyordu; pazaryerine bozuk değer gidebilirdi). Veri yolu değişmedi:
  `productInfoForm.maxPurchaseQuantity · shippingDuration · desi · warranty · taxPercentage`.
-->
<template>
  <ProductStepCard title="Detay bilgiler" icon="mdi-package-variant-closed"
    description="Tümü isteğe bağlı. Boş bıraktığınız alanlarda Ayarlar'daki varsayılan değer kullanılır.">
    <template #actions>
      <span class="pdc-summary" role="status">
        <v-icon :icon="customCount ? 'mdi-tune-variant' : 'mdi-check-circle-outline'" aria-hidden="true" />
        <template v-if="customCount">{{ customCount }} özel değer · {{ fields.length + 1 - customCount }} varsayılan</template>
        <template v-else>Tümü varsayılan değerleri kullanıyor</template>
      </span>
    </template>

    <div class="pdc-groups">
      <section v-for="g in groups" :key="g.key" class="pdc-group" :aria-labelledby="`pdc-g-${g.key}`">
        <header class="pdc-group__head">
          <span class="pdc-group__icon" aria-hidden="true"><v-icon :icon="g.icon" /></span>
          <div>
            <h3 :id="`pdc-g-${g.key}`" class="pdc-group__title">{{ g.title }}</h3>
            <p class="pdc-group__desc">{{ g.desc }}</p>
          </div>
        </header>

        <div class="pdc-rows">
          <div v-for="f in g.fields" :key="f.key" class="pdc-row" :class="{ 'is-custom': isCustom(f.key) }">
            <div class="pdc-row__text">
              <label class="pdc-row__label" :for="`pdc-${f.key}`">{{ f.label }}</label>
              <p class="pdc-row__desc">{{ f.desc }}</p>
            </div>
            <div class="pdc-row__control">
              <v-text-field :id="`pdc-${f.key}`" v-model="productInfoForm[f.key]" variant="outlined" type="tel" inputmode="decimal"
                :maxlength="16" :rules="rules" :suffix="f.unit" :placeholder="`${f.def}`" hide-details="auto"
                autocomplete="off" class="pdc-input" :aria-describedby="`pdc-${f.key}-state`" />
              <p :id="`pdc-${f.key}-state`" class="pdc-state" :class="{ 'is-custom': isCustom(f.key) }">
                <template v-if="isCustom(f.key)">
                  <span class="pdc-state__tag">Özel değer</span>
                  <span class="pdc-state__def">Varsayılan: {{ f.def }} {{ f.unit }}</span>
                  <button type="button" class="pdc-reset" @click="reset(f.key)">Varsayılana dön</button>
                </template>
                <template v-else>
                  <v-icon icon="mdi-check" aria-hidden="true" />Varsayılan kullanılıyor: {{ f.def }} {{ f.unit }}
                </template>
              </p>
            </div>
          </div>

          <!-- KDV: hızlı oran + diğer oranlar -->
          <div v-if="g.key === 'measure'" class="pdc-row" :class="{ 'is-custom': isCustom('taxPercentage') }">
            <div class="pdc-row__text">
              <label class="pdc-row__label" for="pdc-taxPercentage">KDV</label>
              <p class="pdc-row__desc">Ürünün satışta uygulanacak katma değer vergisi oranı.</p>
            </div>
            <div class="pdc-row__control">
              <div class="pdc-tax">
                <div class="pdc-seg" role="radiogroup" aria-label="Sık kullanılan KDV oranları">
                  <button v-for="r in COMMON_TAX" :key="r" type="button" role="radio" class="pdc-seg__btn"
                    :class="{ 'is-on': Number(productInfoForm.taxPercentage) === r }" :aria-checked="Number(productInfoForm.taxPercentage) === r"
                    @click="productInfoForm.taxPercentage = r">%{{ r }}</button>
                </div>
                <v-select id="pdc-taxPercentage" v-model.number="productInfoForm.taxPercentage" :items="taxList" item-value="_id"
                  variant="outlined" clearable hide-details :placeholder="`Diğer · varsayılan %${defaults.taxPercentage}`"
                  class="pdc-input pdc-tax__select" :aria-describedby="'pdc-taxPercentage-state'">
                  <template #selection="{ item }">%{{ item.raw.title }}</template>
                </v-select>
              </div>
              <p id="pdc-taxPercentage-state" class="pdc-state" :class="{ 'is-custom': isCustom('taxPercentage') }">
                <template v-if="isCustom('taxPercentage')">
                  <span class="pdc-state__tag">Özel değer</span>
                  <span class="pdc-state__def">Varsayılan: %{{ defaults.taxPercentage }}</span>
                  <button type="button" class="pdc-reset" @click="reset('taxPercentage')">Varsayılana dön</button>
                </template>
                <template v-else><v-icon icon="mdi-check" aria-hidden="true" />Varsayılan kullanılıyor: %{{ defaults.taxPercentage }}</template>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </ProductStepCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ProductStepCard from '../crud/ProductStepCard.vue'
import { useStaticsStore } from '@/stores/staticsStore'
import useFormRules from '@/composables/formrules'

const props = defineProps<{ productInfoForm: any }>()
// Çağıranlar bu olayları dinliyor (eski arayüz); bileşen yaymaz.
defineEmits(['refreshImages', 'refreshVariants', 'refreshTotalVariantsStockCount', 'close'])

const { t } = useI18n()
const staticsStore = useStaticsStore()
const formRules = useFormRules()

type Key = 'maxPurchaseQuantity' | 'shippingDuration' | 'desi' | 'warranty' | 'taxPercentage'
const defaults = computed(() => ({
  maxPurchaseQuantity: staticsStore.maxPurchaseQuantity,
  shippingDuration: staticsStore.shippingDuration,
  desi: staticsStore.desi,
  warranty: staticsStore.warranty,
  taxPercentage: staticsStore.taxPercentage,
}))

/** Boş = sayı yok; tam sayı ya da (desi gibi) ondalık — "1,5" da kabul. En fazla 16 karakter (eski sınır). */
const rules = [
  ...formRules.length_0_16,
  (v: any) => v === null || v === undefined || v === '' || /^\d+([.,]\d+)?$/.test(String(v).trim()) || t('rules.mustnumber'),
]

interface Field { key: Exclude<Key, 'taxPercentage'>; label: string; desc: string; unit: string; def: number }
const fieldDefs = computed<Record<string, Field>>(() => ({
  maxPurchaseQuantity: { key: 'maxPurchaseQuantity', label: 'Maksimum Satış Adedi', desc: 'Bir siparişte alınabilecek en fazla miktar.', unit: 'adet', def: defaults.value.maxPurchaseQuantity },
  shippingDuration: { key: 'shippingDuration', label: 'Kargo Süresi', desc: 'Siparişten sonra ürünün kargoya verileceği süre.', unit: 'gün', def: defaults.value.shippingDuration },
  desi: { key: 'desi', label: 'Desi', desc: 'Paketin hacimsel ağırlığı; kargo ücretini belirler.', unit: 'dm³', def: defaults.value.desi },
  warranty: { key: 'warranty', label: 'Garanti Süresi', desc: 'Üretici ya da satıcı garantisinin süresi.', unit: 'ay', def: defaults.value.warranty },
}))
const groups = computed(() => [
  { key: 'sales', title: 'Satış ve kargo', desc: 'Siparişin nasıl alınıp gönderileceği', icon: 'mdi-truck-fast-outline',
    fields: [fieldDefs.value.maxPurchaseQuantity, fieldDefs.value.shippingDuration] },
  { key: 'measure', title: 'Ölçü, garanti ve vergi', desc: 'Kargo hesabı, garanti ve fatura bilgileri', icon: 'mdi-ruler-square',
    fields: [fieldDefs.value.desi, fieldDefs.value.warranty] },
])
const fields = computed(() => Object.values(fieldDefs.value))

const COMMON_TAX = [1, 10, 20]
const taxList = Array.from({ length: 29 }, (_, i) => ({ _id: i + 1, value: i + 1, title: i + 1 }))

const isCustom = (key: Key) => {
  const v = props.productInfoForm?.[key]
  return !(v === null || v === undefined || v === '')
}
const customCount = computed(() => (['maxPurchaseQuantity', 'shippingDuration', 'desi', 'warranty', 'taxPercentage'] as Key[]).filter(isCustom).length)
function reset(key: Key) { props.productInfoForm[key] = undefined }
</script>

<style scoped>
.pdc-summary {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 32px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  font-weight: 600;
}
.pdc-summary .v-icon { font-size: var(--ek-icon-sm); color: var(--ek-color-action); }

.pdc-groups {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ek-space-5);
  align-items: start;
}
.pdc-group {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  overflow: hidden;
}
.pdc-group__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}
.pdc-group__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}
.pdc-group__icon .v-icon { font-size: var(--ek-icon-md); }
.pdc-group__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: 600;
}
.pdc-group__desc { margin: 0; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }

.pdc-rows { display: flex; flex-direction: column; }
.pdc-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 15rem);
  gap: var(--ek-space-2) var(--ek-space-5);
  align-items: start;
  padding: var(--ek-space-4) var(--ek-space-5);
  transition: background-color var(--ek-motion-feedback);
}
.pdc-row + .pdc-row { border-top: 1px solid var(--ek-color-border-subtle); }
.pdc-row.is-custom { background: color-mix(in srgb, var(--ek-color-action-subtle) 45%, var(--ek-color-surface)); }
.pdc-row.is-custom::before {
  content: '';
  position: absolute;
  inset: var(--ek-space-3) auto var(--ek-space-3) 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--ek-color-action);
}
.pdc-row__text { min-width: 0; padding-top: var(--ek-space-2); }
.pdc-row__label { display: block; color: var(--ek-color-content-strong); font-size: var(--ek-type-body-size); font-weight: 600; }
.pdc-row__desc { margin: 2px 0 0; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
.pdc-row__control { display: flex; flex-direction: column; gap: var(--ek-space-1); min-width: 0; }

.pdc-input :deep(.v-field) { border-radius: var(--ek-radius-control); background: var(--ek-color-surface); }
.pdc-input :deep(input) { font-variant-numeric: tabular-nums; }
.pdc-input :deep(.v-text-field__suffix) { color: var(--ek-color-content-muted); opacity: 1; }
.pdc-input :deep(input::placeholder) { color: var(--ek-color-content-subtle); opacity: 1; }

.pdc-state {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
.pdc-state .v-icon { font-size: var(--ek-icon-sm); color: var(--ek-color-success); }
.pdc-state__tag {
  padding: 0 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-weight: 600;
}
.pdc-reset {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  padding: 1px var(--ek-space-2);
  color: var(--ek-color-action);
  font-weight: 600;
  text-decoration: none;
  border-radius: var(--ek-radius-control);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}
/* Hover: alt çizgi yok — hafif eylem zemini. */
.pdc-reset:hover { background: var(--ek-color-action-subtle); color: var(--ek-color-action-emphasis); }
.pdc-reset:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }

.pdc-tax { display: flex; flex-direction: column; gap: var(--ek-space-2); }
.pdc-seg {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}
.pdc-seg__btn {
  flex: 1 1 0;
  min-height: 30px;
  padding: 0 var(--ek-space-3);
  border-radius: calc(var(--ek-radius-control) - 2px);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  font-variant-numeric: tabular-nums;
  transition: var(--ek-transition-colors);
}
.pdc-seg__btn:hover:not(.is-on) { background: var(--ek-color-surface-muted); }
.pdc-seg__btn.is-on { background: var(--ek-color-action-subtle); color: var(--ek-color-action-emphasis); box-shadow: inset 0 0 0 1px var(--ek-color-action-border); }
.pdc-seg__btn:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }

@media (max-width: 1199px) {
  .pdc-groups { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 599px) {
  .pdc-row { grid-template-columns: minmax(0, 1fr); padding: var(--ek-space-4); }
  .pdc-row__text { padding-top: 0; }
}
@media (prefers-reduced-motion: reduce) { .pdc-row, .pdc-seg__btn, .pdc-reset { transition: none; } }

/* FE-LOCAL-1054 — elle değiştirilen satır: sol şerit yerine yalnız eylem renginin düz açık zemini. */
.pdc-row.is-custom {
  background: var(--ek-color-action-subtle);
}

.pdc-row.is-custom::before {
  display: none;
}

.pdc-group__head :deep(.ek-icon-tile) {
  background: var(--ek-color-surface);
}
</style>
