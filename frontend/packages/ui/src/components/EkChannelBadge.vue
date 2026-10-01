<!--
  packages/ui/src/components/EkChannelBadge.vue

  K13 / FR2 madde 11–14 — KANAL ROZETİ (uygulamanın tek rozet biçimi; tanıtım sitesindeki `ChannelMono` ile aynı dil):
  kenarlık = marka renginin KOYUSU, iç zemin = AÇIĞI, metin = koyu marka tonu. Tonlar `.ek-ch-<kod>` kapsamındaki
  `--ek-ch-badge-{bg,border,fg}` token'larından (formül `tokens/render.ts`, oranlar `palette.ts` `channelBadgeMix`); burada
  renk TANIMLANMAZ. Kanal ve kargo firması aynı bileşen (`kind`); ölçülmemiş/bilinmeyen marka NÖTR rozet alır.

  Biçimler (tek kayıt: `CHANNEL_NAMES` / `CHANNEL_SHORT` / `CARRIERS`):
    form="long"  (varsayılan) → [ Trendyol ]  — liste hücresi, filtre çipi, başlık
    form="short"              → [TY]          — dar sütun, kanal başına durum, seçim listesi öncülü (ad `title` + ekran okuyucu)
  `muted`: pasif (ör. ürün bu kanalda yok) — nötr, kesik kenarlık.
  Boyut: xs 20px · sm 24px (varsayılan) · md 28px. Renk tek başına anlam taşımaz: kısa formda da ad erişilebilir addır.

  Kullanım:
    <EkChannelBadge code="trendyol" />
    <EkChannelBadge code="hepsiburada" form="short" size="xs" />
    <EkChannelBadge kind="carrier" name="Yurtiçi Kargo" />
-->
<template>
  <span class="ek-chb" :class="[muted ? 'ek-ch-neutral' : scope, `ek-chb--${form}`, `ek-chb--${size}`, { 'is-muted': muted }]" :title="form === 'short' ? label : undefined"
    :data-channel="resolvedCode || undefined">
    <template v-if="form === 'short'">
      <span class="ek-chb__mark" aria-hidden="true">{{ short }}</span>
      <span class="ek-sr-only">{{ label }}</span>
    </template>
    <span v-else class="ek-chb__name">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { brandName, carrierCode, channelClass, channelCode, channelShort } from '../tokens/channels'

const props = withDefaults(
  defineProps<{
    /** Kanal kodu (`channelPalette` anahtarı) ya da kargo firması kodu (`CARRIERS`). */
    code?: string | null
    /** Görünen ad (verilmezse kayıttan). Kargo firmasında serbest metin ad da kodu çözer. */
    name?: string | null
    kind?: 'channel' | 'carrier'
    form?: 'long' | 'short'
    size?: 'xs' | 'sm' | 'md'
    /** "Yok / pasif" görünümü: nötr tonlar + kesik kenarlık (ör. ürün o kanalda yok). Metin kontrastı AA kalır. */
    muted?: boolean
  }>(),
  { code: '', name: '', kind: 'channel', form: 'long', size: 'sm', muted: false },
)

const resolvedCode = computed(() =>
  props.kind === 'carrier' ? (carrierCode(props.code) ?? carrierCode(props.name) ?? '') : (channelCode(props.code) ?? String(props.code ?? '')),
)
// Renk kapsamı: kod `channelPalette`'te varsa marka tonları, yoksa nötr (ölçülmemiş kargo firması dahil).
const scope = computed(() => channelClass(resolvedCode.value))
const label = computed(() => brandName(resolvedCode.value || props.code, props.name))
const short = computed(() => channelShort(resolvedCode.value || props.code, props.name))
</script>

<style scoped>
.ek-chb {
  --ek-chb-h: 24px;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: var(--ek-chb-h);
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--ek-ch-badge-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-badge-bg);
  color: var(--ek-ch-badge-fg);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  line-height: 1;
  vertical-align: middle;
  white-space: nowrap;
}

.ek-chb--xs { --ek-chb-h: 20px; font-size: var(--ek-font-size-xs); }
.ek-chb--md { --ek-chb-h: 28px; font-size: var(--ek-font-size-sm); }

.ek-chb--long {
  padding: 0 var(--ek-space-2);
}

.ek-chb--xs.ek-chb--long { padding: 0 6px; }
.ek-chb--md.ek-chb--long { padding: 0 10px; }

.ek-chb__name {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Pasif: nötr kapsam (ton AA) + kesik kenarlık — "bu kanalda yok" tek bakışta; opaklık kullanılmaz (kontrast düşmesin). */
.ek-chb.is-muted {
  border-style: dashed;
  border-color: var(--ek-color-border-strong);
  background: transparent;
  color: var(--ek-color-content-muted);
}

/* Kısa form: kare monogram (3 harfte hafifçe genişler); köşe rozetle aynı dil, biraz daha kare. */
.ek-chb--short {
  min-width: var(--ek-chb-h);
  padding: 0 3px;
  border-radius: var(--ek-radius-sm);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: 0.02em;
}

.ek-chb--xs.ek-chb--short { font-size: var(--ek-font-size-2xs); padding: 0 2px; }
</style>
