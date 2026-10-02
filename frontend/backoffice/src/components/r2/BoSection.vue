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
          <slot name="title" />
        </div>
        <p v-if="description" class="bo-section__desc">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="bo-section__actions"><slot name="actions" /></div>
    </header>
    <div class="bo-section__body"><slot /></div>
    <footer v-if="$slots.footer" class="bo-section__foot"><slot name="footer" /></footer>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'

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
  }>(),
  { headingLevel: 2 },
)
const uid = useId()
const headingId = computed(() => `${props.id ?? uid}-title`)
</script>

<style scoped>
.bo-section {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
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
  padding: var(--ek-space-4) var(--ek-space-5) 0;
}

.bo-section.is-plain .bo-section__head {
  padding: 0;
}

.bo-section__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
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
  min-height: 32px;
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
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.bo-section__desc {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
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

.bo-section.is-flush .bo-section__body :deep(.bo-table-wrap),
.bo-section.is-flush .bo-section__body :deep(.ek-data-table) {
  border-width: 1px 0 0;
  border-radius: 0;
}

.bo-section__foot {
  padding: var(--ek-space-3) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-section__foot:has(> .bo-pager) {
  padding: 0;
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
</style>
