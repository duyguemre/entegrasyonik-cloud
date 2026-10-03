<!--
  Varyantın KANAL BİLGİLERİ — tüm kanallarda ortak alanlar (başlık, kargo süresi, desi, garanti, maksimum adet).
  Kanala özgü alanlar (kargo firması, teslimat…) ayrı bileşenlerde, aynı ayar satırı (InfoRow) diliyle.
  Varsayılan zinciri: ürün değeri → SEÇİLİ KANALIN ayarları → genel varsayılan (eskiden kanal ne olursa olsun
  Hepsiburada ayarları okunuyordu). Ürün düzeyi KDV burada değil, ürün formunun Detay Bilgiler adımında.
  Veri yolu değişmedi: `v-model` = `variant.platforms[kanal].mapping`. Kök öğesi YOK (satırlar): çağıran, kanala özgü
  bileşenle birlikte tek ızgaraya (`.ci-grid`, channelAttributeEditor.css) yerleştirir.
-->
<template>
  <InfoRow id="ci-title" label="Varyant başlığı" desc="Bu kanalda ürün adı yerine gösterilir." :custom="filled(m.title)"
      :default-text="productInfoForm.title || 'ürün başlığı'" @reset="clear('title')">
      <v-text-field id="ci-title" v-model="m.title" variant="outlined" hide-details="auto" clearable maxlength="160" counter
        :placeholder="productInfoForm.title || 'Ürün başlığı kullanılır'" aria-describedby="ci-title-state" />
    </InfoRow>
    <InfoRow v-for="f in numberFields" :id="`ci-${f.key}`" :key="f.key" :label="f.label" :desc="f.desc" :custom="filled(m[f.key])"
      :default-text="`${f.def} ${f.unit}`" @reset="clear(f.key)">
      <v-text-field :id="`ci-${f.key}`" v-model="m[f.key]" variant="outlined" hide-details="auto" type="tel" inputmode="decimal"
        maxlength="16" :rules="numberRules" :suffix="f.unit" :placeholder="`${f.def}`" :aria-describedby="`ci-${f.key}-state`" />
    </InfoRow>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useStaticsStore } from '@/stores/staticsStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import useFormRules from '@/composables/formrules'
import InfoRow from './InfoRow.vue'

const props = withDefaults(defineProps<{ productInfoForm: any; channel?: string }>(), { channel: 'hepsiburada' })
const m: any = defineModel({ default: {} })

const { t } = useI18n()
const staticsStore = useStaticsStore()
const integrationStore = useIntegrationStore()
const formRules = useFormRules()
const numberRules = [
  ...formRules.length_0_16,
  (v: any) => v === null || v === undefined || v === '' || /^\d+([.,]\d+)?$/.test(String(v).trim()) || t('rules.mustnumber'),
]

const settings = computed(() => integrationStore.getClientIntegration(props.channel)?.settings || {})
const def = (key: 'shippingDuration' | 'desi' | 'warranty' | 'maxPurchaseQuantity') =>
  props.productInfoForm?.[key] || settings.value?.[key] || (staticsStore as any)[key]

const numberFields = computed(() => [
  { key: 'shippingDuration', label: 'Kargo süresi', desc: 'Siparişten sonra kargoya verilme süresi.', unit: 'gün', def: def('shippingDuration') },
  { key: 'desi', label: 'Desi', desc: 'Paketin hacimsel ağırlığı; kargo ücretini belirler.', unit: 'dm³', def: def('desi') },
  { key: 'warranty', label: 'Garanti süresi', desc: 'Bu kanalda gösterilecek garanti süresi.', unit: 'ay', def: def('warranty') },
  { key: 'maxPurchaseQuantity', label: 'Maksimum satış adedi', desc: 'Bir siparişte alınabilecek en fazla miktar.', unit: 'adet', def: def('maxPurchaseQuantity') },
])

const filled = (v: any) => !(v === undefined || v === null || v === '')
function clear(key: string) { m.value[key] = undefined }
</script>
