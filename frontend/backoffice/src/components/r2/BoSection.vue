<!--
  BoSection — BÖLÜM KARTI (BO2-11). Sayfadaki her anlamlı bölüm (dikkat listesi, ana veri listesi, ayar grubu, panel)
  bu kartla çizilir: ayrık yüzey + başlık bandı + tutarlı iç boşluk. Başlık hiyerarşisi tek ölçekten (BO2-30):
  bölüm başlığı `heading` (16/600), açıklama `caption`, gövde `body`.

    <BoSection id="kuyruklar" title="Kuyruk durumu" description="BullMQ sayaçları; 30 sn'de bir tazelenir" icon="mdi-tray-full">
      <template #actions><BoAction kind="refresh" size="sm" @click="load" /></template>
      …içerik…
      <template #footer><BoPagination … /></template>
    </BoSection>

  - `fill`: kart bulunduğu ızgara hücresinin tamamını kaplar (BoTileGrid ile eş yükseklik — BO2-12).
  - `flush`: gövde iç boşluksuz (tablo kenardan kenara; tablo kabının kendi çerçevesi kalkar).
  - `tone`: yalnız durum taşır (CONSOLE_IDENTITY ilke 2) — sol kenar şeridi; zemin nötr kalır.
  - `count`/`total`: liste kartı başlığındaki kayıt sayacı ("24" ya da "24 / 140").
  - `status`: başlığın sağında durum rozeti (Olağan / eşik üstü …); `more`: alt şeritte "ayrıntı ekranı →" bağlantısı.
  Görsel dil genel bakışın kutularıyla ORTAK (tek kaynak): tonlu ikon karesi · başlık · amaç/açıklama · rozet → gövde → alt şerit.
  STANDART LİSTE KARTI: gövdede tablo varsa kart bir liste kartına dönüşür — başlık (ikon · ad · sayaç · açıklama ·
  eylemler) → süzgeç bandı (BoFilterBar, kenardan kenara) → tablo (kenardan kenara) → alt bilgi + sayfalama (BoPagination).
-->
<template>
  <section
    :id="id"
    class="bo-section"
    :class="[{ 'is-fill': fill, 'is-flush': flush, 'is-plain': plain }, tone ? `is-${tone}` : '']"
    :aria-labelledby="title ? headingId : undefined"
    :aria-label="title ? undefined : label"
    data-bo-section
  >
    <header v-if="title || $slots.actions || $slots.title" class="bo-section__head">
      <span v-if="icon" class="bo-section__icon" aria-hidden="true"><v-icon :icon="icon" /></span>
      <div class="bo-section__titles">
        <div class="bo-section__title-row">
          <component :is="`h${headingLevel}`" v-if="title" :id="headingId" class="bo-section__title">{{ title }}</component>
          <span v-if="countText" class="bo-section__count ek-num" :aria-label="`${countText} kayıt`">{{ countText }}</span>
          <slot name="title" />
        </div>
        <p v-if="description" class="bo-section__desc">{{ description }}</p>
      </div>
      <span v-if="status" class="bo-section__status" :class="`is-${status.tone}`" data-testid="triage-answer"><i aria-hidden="true"></i>{{ status.label }}</span>
      <div v-if="$slots.actions" class="bo-section__actions"><slot name="actions" /></div>
    </header>
    <div class="bo-section__body"><slot /></div>
    <footer v-if="$slots.footer || more" class="bo-section__foot">
      <slot name="footer" />
      <RouterLink v-if="more" :to="more.to" class="bo-section__more">{{ more.label }}<v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(
  defineProps<{
    id?: string
    title?: string
    description?: string
    icon?: string
    /** Başlıksız bölümde bölgenin erişilebilir adı. */
    label?: string
    headingLevel?: 2 | 3 | 4
    fill?: boolean
    flush?: boolean
    /** Kartsız bölüm (yalnız başlık + boşluk hiyerarşisi) — kart içinde alt bölüm için. */
    plain?: boolean
    tone?: 'critical' | 'warning' | 'info' | 'success'
    /** Liste kartı sayacı: gösterilen kayıt sayısı (ve biliniyorsa toplam). */
    count?: number | null
    total?: number | null
    status?: { label: string; tone: 'ok' | 'warning' | 'critical' | 'neutral' }
    more?: { label: string; to: RouteLocationRaw }
  }>(),
  { headingLevel: 2 },
)
const uid = useId()
const headingId = computed(() => `${props.id ?? uid}-title`)
const nf = new Intl.NumberFormat('tr-TR')
const countText = computed(() => {
  if (props.count === undefined || props.count === null) return ''
  return props.total !== undefined && props.total !== null && props.total !== props.count ? `${nf.format(props.count)} / ${nf.format(props.total)}` : nf.format(props.count)
})
</script>

<style scoped>
.bo-section {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-raised);
}

.bo-section.is-fill {
  height: 100%;
}

.bo-section.is-plain {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.bo-section.is-critical {
  border-left: 3px solid var(--ek-color-error);
}

.bo-section.is-warning {
  border-left: 3px solid var(--ek-color-warning);
}

.bo-section.is-info {
  border-left: 3px solid var(--ek-color-info);
}

.bo-section.is-success {
  border-left: 3px solid var(--ek-color-success);
}

.bo-section__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--ek-space-2) var(--ek-space-3);
  padding: var(--ek-space-5) var(--ek-space-5) 0;
}

.bo-section.is-plain .bo-section__head {
  padding: 0;
}

.bo-section__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.bo-section__icon .v-icon {
  font-size: var(--ek-icon-md);
}

.bo-section__titles {
  display: flex;
  flex: 1 1 240px;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  min-height: 36px;
}

.bo-section__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-2);
}

.bo-section__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: 22px;
  font-weight: var(--ek-font-weight-semibold);
}

.bo-section__desc {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

/* Durum rozeti — genel bakış kutularıyla aynı (uyarı sarımsı, kritik kırmızımsı). */
.bo-section__status {
  --st: var(--ek-color-success);
  --st-ink: var(--ek-color-success);
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 24px;
  margin-top: 6px;
  padding: 0 var(--ek-space-2);
  border: 1px solid color-mix(in srgb, var(--st) 35%, var(--ek-color-border-subtle));
  border-radius: var(--ek-radius-chip);
  background: color-mix(in srgb, var(--st) 9%, var(--ek-color-surface));
  color: var(--st-ink);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
}

.bo-section__status.is-warning {
  --st: var(--bo-warn-fill);
  --st-ink: var(--bo-warn-ink);
  background: var(--bo-warn-wash);
}

.bo-section__status.is-critical {
  --st: var(--ek-color-error);
  --st-ink: var(--ek-color-error-emphasis);
}

.bo-section__status.is-neutral {
  --st: var(--ek-color-content-subtle);
  --st-ink: var(--ek-color-content-muted);
}

.bo-section__status i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--st);
}

.bo-section__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin-left: auto;
}

.bo-section__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-5);
}

.bo-section.is-plain .bo-section__body {
  padding: var(--ek-space-3) 0 0;
}

.bo-section.is-flush .bo-section__body {
  padding: var(--ek-space-3) 0 0;
}


/* ---------- STANDART LİSTE KARTI ----------
   Sayaç: başlığın yanında sakin hap. */
.bo-section__count {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-subtle);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-section__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
  border-radius: 0 0 calc(var(--ek-radius-card) - 1px) calc(var(--ek-radius-card) - 1px);
  background: var(--ek-color-surface-muted);
}

.bo-section__foot > :deep(*) {
  margin-top: 0;
  margin-bottom: 0;
}

.bo-section__more {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  text-decoration: none;
}

.bo-section__more .v-icon {
  font-size: var(--ek-icon-sm);
  transition: transform var(--ek-motion-feedback);
}

.bo-section__more:hover .v-icon {
  transform: translateX(2px);
}

.bo-section__more:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-section__foot:has(> .bo-pager) {
  padding: 0;
}

.bo-section__foot > :deep(.bo-pager) {
  flex: 1 1 100%;
  border-top: 0;
  border-radius: inherit;
}

@media (max-width: 600px) {
  .bo-section__head {
    padding: var(--ek-space-3) var(--ek-space-4) 0;
  }

  .bo-section__body {
    padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-4);
  }

  .bo-section__foot {
    padding: var(--ek-space-3) var(--ek-space-4);
  }
}

/* ================= BO-LOCAL-01 — bölüm kartı: uygulamanın tasarım diliyle =================
   Düz kart (gölge yok). Başlık BANDI sakin zeminde, gövdeden ince çizgiyle ayrılır; ikon beyaz zeminde çerçeveli
   köşeli kutu. Ton varyantında sol kalın şerit yok: tonun ince çerçevesi (kartın tamamında). Sayaç ve durum rozeti köşeli. */
.bo-section {
  overflow: hidden;
  box-shadow: none;
}

.bo-section.is-plain {
  overflow: visible;
}

.bo-section.is-critical { border-left: 1px solid var(--ek-color-error-border); border-color: var(--ek-color-error-border); }
.bo-section.is-warning { border-left: 1px solid var(--ek-color-warning-border); border-color: var(--ek-color-warning-border); }
.bo-section.is-info { border-left: 1px solid var(--ek-color-info-border); border-color: var(--ek-color-info-border); }
.bo-section.is-success { border-left: 1px solid var(--ek-color-success-border); border-color: var(--ek-color-success-border); }

.bo-section:not(.is-plain) > .bo-section__head {
  align-items: center;
  padding: var(--ek-space-3) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}

.bo-section.is-critical:not(.is-plain) > .bo-section__head { border-bottom-color: var(--ek-color-error-border); background: var(--ek-color-error-subtle); }
.bo-section.is-warning:not(.is-plain) > .bo-section__head { border-bottom-color: var(--ek-color-warning-border); background: var(--ek-color-warning-subtle); }

.bo-section__icon {
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
}

.bo-section.is-plain .bo-section__icon {
  background: var(--ek-color-action-subtle);
}

.bo-section__title {
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
}

.bo-section__desc {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-section__status {
  margin-top: 0;
  border-color: var(--ek-color-success-border);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.bo-section__status.is-warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.bo-section__status.is-critical {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.bo-section__status.is-neutral {
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
}

.bo-section__status i {
  border-radius: 2px;
}

.bo-section__count {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  box-shadow: none;
}

.bo-section:not(.is-plain) > .bo-section__body {
  padding-top: var(--ek-space-5);
}

.bo-section.is-flush:not(.is-plain) > .bo-section__body {
  padding-top: 0;
}

.bo-section__foot {
  border-top-color: var(--ek-color-border-default);
}

@media (max-width: 600px) {
  .bo-section:not(.is-plain) > .bo-section__head {
    padding: var(--ek-space-3) var(--ek-space-4);
  }
}
</style>
