<!--
  frontend/src/components/productDefinitions/crud/ProductFormSection.vue

  FE R5 B — ürün formu BÖLÜM KARTI. Her adım bir ya da birkaç kart: başlık bandı (ikon kapsülü + başlık + tek satır yardım
  + sağda isteğe bağlı eylem/rozet) ve gövdede `EkFormGrid` (eşit kolon, 16px boşluk; dar kapta tek kolon).
  `role="group"` + görünür başlık adı (fieldset/legend eşdeğeri: ekran okuyucu bölüm adını alanlarla birlikte okur); `bare` gövdeyi ızgarasız verir
  (galeri, editör gibi serbest içerik). Yalnız sunum.
-->
<template>
  <section class="pfc" :class="{ 'pfc--muted': muted }" role="group" :aria-labelledby="`${uid}-t`"
    :aria-describedby="description ? `${uid}-d` : undefined">
    <div class="pfc__head">
      <EkIconTile :icon="icon" size="sm" :tone="tone" />
      <div class="pfc__titles">
        <span :id="`${uid}-t`" class="pfc__title">{{ title }}</span>
        <span v-if="description" :id="`${uid}-d`" class="pfc__desc">{{ description }}</span>
      </div>
      <div v-if="$slots.aside" class="pfc__aside">
        <slot name="aside" />
      </div>
    </div>
    <div class="pfc__body">
      <slot v-if="bare" />
      <EkFormGrid v-else :columns="columns">
        <slot />
      </EkFormGrid>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import { EkFormGrid, EkIconTile, type EkTone } from '@entegrasyonik/ui/components'

const uid = useId()

withDefaults(
  defineProps<{
    title: string
    icon: string
    description?: string
    columns?: 1 | 2 | 3 | 4
    bare?: boolean
    tone?: EkTone
    /** İsteğe bağlı bölümler için daha sakin zemin. */
    muted?: boolean
  }>(),
  { columns: 2, bare: false, tone: 'neutral', muted: false },
)
</script>

<style scoped>
.pfc {
  min-width: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.pfc__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 60px;
  padding: var(--ek-space-3) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.pfc__titles {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
}

.pfc__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.pfc__desc {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-wrap: pretty;
}

/* Başlık bandının sağındaki eylem/rozet. */
.pfc__aside {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
}

.pfc__body {
  padding: var(--ek-space-5);
}

@container pform (max-width: 599px) {
  .pfc__head {
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .pfc__head {
    flex-wrap: wrap;
  }

  .pfc__body {
    padding: var(--ek-space-4);
  }
}
</style>
