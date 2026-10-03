<!--
  frontend/src/components/integrations/IntegrationPlatformRail.vue

  ADR-0015 Karar 3.11/6.1 — pazaryeri/e-ticaret/ERP/kargo/e-fatura ekranlarının
  üst kısmındaki "seçilebilir ray" (WAI-ARIA `tablist`, `EkPageTabs`in seçilebilir
  kart varyantı). TEK KAYNAK: önceden Marketplace/ECommerce/Erp/Shipping/EInvoice
  view'larının HER BİRİ aynı `.nav-item-wrapper` + klavye gezinimi mantığını
  (roving tabindex) ayrı ayrı tanımlıyordu (5 kopya). `EkPlatformMark` (Karar
  3.11) ile birlikte kullanılır; eski `PlatformImageComponent` (retro kart,
  hover'da `translateY`, veri eksikliğinde soluk gri düşüşü) burada KULLANILMAZ.

  FE-LOCAL-1048 — ana sayfa diliyle KANAL KARTI: düz yüzey + ince çerçeve, üstte 2px kanal marka çizgisi
  (`.ek-ch-<kod>` → `--ek-ch-brand`; "Katalog ve kanal aktarımı" kartıyla aynı kalıp), çerçeveli logo kutusu + ad,
  sağda durum çipi. Seçili kart = eylem renginin açık tonu + eylem çerçevesi (gölge yok; hover yalnız zemin tonu).
  `activeCodes` verilirse canlı kanalda "Etkin" / "Pasif" çipi görünür (kayıtlı ayardan — `useIntegrationScreen`);
  verilmezse canlı kanalda çip yok (eski davranış).

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
      <EkStatusChip v-else-if="activeCodes" :tone="activeCodes.includes(item.code) ? 'success' : 'neutral'"
        :label="activeCodes.includes(item.code) ? 'Etkin' : 'Pasif'" dot class="ek-integration-rail__badge" />
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
    /** Kayıtlı bağlantı durumu açık olan kodlar; verilirse canlı kartta "Etkin" / "Pasif" çipi. */
    activeCodes?: string[]
    ariaLabel: string
  }>(),
  {
    modelValue: '',
    liveCodes: () => [],
    activeCodes: undefined,
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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: var(--ek-space-3);
}

/* Kanal kartı: düz yüzey + ince çerçeve; kimliği üstteki 2px marka çizgisi ve logo kutusu taşır (tint, gölge yok). */
.ek-integration-rail__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ek-space-2);
  min-width: 0;
  min-height: 76px;
  padding: var(--ek-space-3);
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
  /* fe-polish: koyu temada koyu marka renkleri (ör. Ideasoft) koyu yüzeyde kaybolur → K13 rozet kenarlığı (marka hex'i
     değişmez, açık mürekkeple karışır). Açık temada birebir marka rengi; kodu olmayan sağlayıcıda nötr çizgi. */
  --ek-rail-accent: var(--ek-ch-brand, var(--ek-color-border-strong));
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-integration-rail__item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--ek-rail-accent);
}

.ek-integration-rail__item:hover {
  background: var(--ek-color-surface-muted);
}

.ek-integration-rail__item:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

/* Seçim yalnız renkle değil: eylem çerçevesi + açık ton zemin + yarı kalın ad + aria-selected. */
.ek-integration-rail__item.is-selected {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

:global(:root[data-theme='dark']) .ek-integration-rail__item {
  --ek-rail-accent: var(--ek-ch-badge-border, var(--ek-color-border-strong));
}

.ek-integration-rail__item :deep(.ek-platform-mark) {
  min-width: 0;
}

/* Uzun sağlayıcı adı kesilmez — iki satıra sarar. */
.ek-integration-rail__item :deep(.ek-platform-mark__name) {
  overflow-wrap: anywhere;
  white-space: normal;
  line-height: 1.25;
}

.ek-integration-rail__item.is-selected :deep(.ek-platform-mark__name) {
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-integration-rail__badge {
  flex: none;
}

@media (max-width: 599px) {
  .ek-integration-rail {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}
</style>
