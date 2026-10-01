<!--
  frontend/src/components/integrations/IntegrationPlatformRail.vue

  ADR-0015 Karar 3.11/6.1 — pazaryeri/e-ticaret/ERP/kargo/e-fatura ekranlarının
  üst kısmındaki "seçilebilir ray" (WAI-ARIA `tablist`, `EkPageTabs`in seçilebilir
  kart varyantı). TEK KAYNAK: önceden Marketplace/ECommerce/Erp/Shipping/EInvoice
  view'larının HER BİRİ aynı `.nav-item-wrapper` + klavye gezinimi mantığını
  (roving tabindex) ayrı ayrı tanımlıyordu (5 kopya). `EkPlatformMark` (Karar
  3.11) ile birlikte kullanılır; eski `PlatformImageComponent` (retro kart,
  hover'da `translateY`, veri eksikliğinde soluk gri düşüşü) burada KULLANILMAZ.

  "Yakında" (N13): `liveCodes` listesinde OLMAYAN bir platform kodu, monogramın
  yanında `EkStatusChip tone="neutral" label="Yakında"` ile işaretlenir — asla
  "bağlı/aktif" göstermez (E3 entegrasyon dürüstlüğü).

  Kullanım:
    <IntegrationPlatformRail
      :items="clientMarketplaces"
      :model-value="editingClientIntegration.code"
      :live-codes="['trendyol','hepsiburada','n11','pazarama']"
      aria-label="Pazar yeri seçimi"
      @select="setAndRetrieveEditingClientMarketplace"
    />
-->
<template>
  <div class="ek-integration-rail" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="item in items"
      :key="item.code"
      type="button"
      class="ek-integration-rail__item nav-item-wrapper"
      :class="[channelClass(isLive(item.code) ? item.code : undefined), { 'is-selected': modelValue === item.code }]"
      role="tab"
      :aria-selected="modelValue === item.code"
      :tabindex="modelValue === item.code ? 0 : -1"
      :aria-label="item.code"
      @click="emit('select', item.code)"
      @keydown="onKeydown($event)"
    >
      <EkPlatformMark
        :name="displayName(item.code)"
        :code="isLive(item.code) ? item.code : undefined"
        size="lg"
      />
      <EkStatusChip v-if="!isLive(item.code)" tone="neutral" label="Yakında" class="ek-integration-rail__badge" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { EkPlatformMark, EkStatusChip } from '@entegrasyonik/ui/components'
import { channelClass } from '@entegrasyonik/ui/tokens'

export interface IntegrationRailItem {
  code: string
  /** `IntegrationService` katalog kaydının alan adı (bkz. `integrationStore.getIntegrationTitle`). */
  title?: string
  name?: string
}

// `einvoiceStore` gibi bazı kaynaklar yalnızca `code` taşır (bkz. `src/stores/einvoice.ts`) —
// bu ekranlarda gösterilecek okunur ad için küçük bir yedek harita (yalnızca bu bileşenin
// göstereceği bilinen kodlar; kaynağın kendisi bu görevin kapsamı dışında).
const FRIENDLY_NAME_FALLBACK: Record<string, string> = {
  trendyolefaturam: 'Trendyol e-Faturam',
  turkcellesirket: 'Turkcell e-Şirket',
  elogo: 'e-Logo',
  geliridaresi: 'Gelir İdaresi (GİB)',
  woocommerce: 'WooCommerce',
  eticaretsoft: 'ETicaretSoft',
  anka: 'Anka E-Ticaret',
  yurtici: 'Yurtiçi Kargo',
  surat: 'Sürat Kargo',
  mng: 'MNG Kargo',
  ups: 'UPS',
  ptt: 'PTT Kargo',
}

const props = withDefaults(
  defineProps<{
    items: IntegrationRailItem[]
    modelValue?: string
    /** `docs/INTEGRATIONS_REGISTRY.md`'deki 6 gerçek kod (ADR-0014 ile aynı canlı küme). */
    liveCodes?: string[]
    ariaLabel: string
  }>(),
  {
    modelValue: '',
    liveCodes: () => [],
  },
)

const emit = defineEmits<{ select: [code: string] }>()

function isLive(code: string) {
  return props.liveCodes.includes(code)
}

function displayName(code: string) {
  const item = props.items.find((i) => i.code === code)
  return (
    item?.title ||
    item?.name ||
    FRIENDLY_NAME_FALLBACK[code] ||
    (code ? code.charAt(0).toUpperCase() + code.slice(1) : '?')
  )
}

// Klavye erişimi (WAI-ARIA APG "tablist" deseni — roving tabindex): Enter/Space
// seçimi tetikler (native `<button>` Enter/Space'i zaten `click`e çevirir, bu
// yüzden burada YALNIZCA ok tuşlarıyla rayın içinde odak taşınır — Enter/Space'i
// AYRICA işlemek `@click` ile ÇİFT tetiklemeye yol açardı).
function onKeydown(event: KeyboardEvent) {
  const key = event.key
  if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowUp') {
    event.preventDefault()
    const wrapper = event.currentTarget as HTMLElement
    const rail = wrapper.parentElement
    if (!rail) return
    const els = Array.from(rail.querySelectorAll<HTMLElement>(':scope > .ek-integration-rail__item'))
    const idx = els.indexOf(wrapper)
    const forward = key === 'ArrowRight' || key === 'ArrowDown'
    const nextIdx = forward ? (idx + 1) % els.length : (idx - 1 + els.length) % els.length
    els[nextIdx]?.focus()
  }
}
</script>

<style scoped>
.ek-integration-rail {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
}

/* C1: kanal kartı kendi marka rengini taşır (tint yok) — solda 3px marka şeridi + marka zeminli logo; seçili kart
   marka kenarlığı + marka halkası (seçim yalnız renkle değil, kalın çerçeve + koyu ad + aria-selected ile). */
.ek-integration-rail__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: 44px;
  padding: 0 var(--ek-space-4) 0 var(--ek-space-3);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  /* fe-polish: koyu temada koyu marka renkleri (ör. Ideasoft) koyu yüzeyde kaybolur → K13 rozet kenarlığı (marka hex'i
     değişmez, açık mürekkeple karışır). Açık temada birebir marka rengi. */
  --ek-rail-accent: var(--ek-ch-brand);
  box-shadow: inset 3px 0 0 var(--ek-rail-accent), var(--ek-shadow-card);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-integration-rail__item:hover {
  border-color: var(--ek-rail-accent);
}

.ek-integration-rail__item:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

.ek-integration-rail__item.is-selected {
  border-color: var(--ek-rail-accent);
  box-shadow: inset 3px 0 0 var(--ek-rail-accent), 0 0 0 1px var(--ek-rail-accent);
}

:global(:root[data-theme='dark']) .ek-integration-rail__item {
  --ek-rail-accent: var(--ek-ch-badge-border);
}

.ek-integration-rail__item.is-selected :deep(.ek-platform-mark__name) {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-integration-rail__badge {
  flex: none;
}
</style>
