<!--
  frontend/src/components/layout/ShortcutKeycaps.vue

  fe-a14 — kısayol diyaloğunun "gerçek tuş" kapakları. Eşit yükseklik, ince kenar + alt gölge (basılabilir tuş hissi),
  sistem yazı tipi (monospace DEĞİL). Ayırıcılar sakin: Windows/Linux'ta ince "+", macOS'ta boşluk (⌘K geleneği),
  sıralı tuşlarda "sonra", takma adlar arasında "veya". Görsel kapaklar ekran okuyucudan gizlidir; yerine konuşma metni
  ("Command K", "Ctrl artı K") okunur. Tek kaynak: `navigation/shortcutCatalog.ts` (platform eşlemesi).
  `EkKbd` (menü/tooltip) değişmedi — bu bileşen yalnız diyalog ve ipucu kuşağı içindir.
-->
<template>
  <span class="ek-keycaps" :class="[`ek-keycaps--${size}`, `ek-keycaps--${platform}`]">
    <template v-for="(combo, ci) in combos" :key="ci">
      <span v-if="ci > 0" class="ek-keycaps__or" :class="{ 'ek-keycaps__or--slash': singles }" aria-hidden="true">{{ singles ? '/' : 'veya' }}</span>
      <span class="ek-keycaps__combo" aria-hidden="true">
        <template v-for="(key, ki) in combo" :key="ki">
          <span v-if="ki > 0 && sequence" class="ek-keycaps__then">sonra</span>
          <span v-else-if="ki > 0 && platform === 'win'" class="ek-keycaps__plus">+</span>
          <kbd class="ek-keycap" :class="{ 'ek-keycap--symbol': isSymbol(key), 'is-match': !!query && keyMatchesQuery(raw[ci][ki], query) }">
            <v-icon v-if="ARROW_ICON[key]" class="ek-keycap__icon" :icon="ARROW_ICON[key]" />
            <template v-else>{{ key }}</template>
          </kbd>
        </template>
      </span>
    </template>
    <span class="ek-sr-only">{{ spoken }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { keyMatchesQuery, platformKeys, spokenKeys, type KeyPlatform } from '@/navigation/shortcutCatalog'

const props = withDefaults(
  defineProps<{
    keys: readonly string[]
    aliases?: readonly (readonly string[])[]
    platform: KeyPlatform
    sequence?: boolean
    size?: 'md' | 'lg'
    /** Arama sorgusu: terimi işaret edilen tuş kapakları vurgulanır (ör. "alt" → yalnız Alt kapakları). */
    query?: string
  }>(),
  { aliases: () => [], sequence: false, size: 'md', query: '' },
)

const raw = computed(() => [props.keys, ...props.aliases])
const combos = computed(() => raw.value.map((c) => platformKeys(c, props.platform)))
const spoken = computed(() => raw.value.map((c) => spokenKeys(c, props.platform, props.sequence)).join(' veya '))
const isSymbol = (key: string) => /^[⌘⌥⇧⌃↩⌫⌦←→↑↓?]$/.test(key)
/** Tüm seçenekler tek tuşsa (↑ / ↓) ayırıcı "/"; birleşik tuşlarda "veya". */
const singles = computed(() => raw.value.length > 1 && raw.value.every((c) => c.length === 1))
// Ok glifleri yazı tipinde küçük ve ince kalıyor → MDI oku (kapak içinde net, yazıyla orantılı).
const ARROW_ICON: Record<string, string> = { '←': 'mdi-arrow-left', '→': 'mdi-arrow-right', '↑': 'mdi-arrow-up', '↓': 'mdi-arrow-down' }
</script>

<style scoped>
.ek-keycaps {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-1) var(--ek-space-2);
}

.ek-keycaps__combo {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.ek-keycaps--mac .ek-keycaps__combo {
  gap: var(--ek-space-1);
}

.ek-keycap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 24px;
  height: 24px;
  padding: 0 7px 1px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: linear-gradient(180deg, var(--ek-color-surface) 0%, var(--ek-color-surface-muted) 100%);
  box-shadow:
    inset 0 -2px 0 var(--ek-color-border-subtle),
    0 1px 0 var(--ek-color-border-default);
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-sans);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  font-feature-settings: 'tnum';
  line-height: 1;
  transition: var(--ek-transition-colors);
}

/* Sembol glifleri (⌘ ⇧ ← ↑ ?) yazı ölçüsünde küçük kalır — bir kademe büyük, kapak ölçüsü aynı. */
.ek-keycap--symbol {
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-medium);
}

.ek-keycaps--lg .ek-keycap {
  min-width: 32px;
  height: 32px;
  padding: 0 var(--ek-space-2) 2px;
  border-radius: var(--ek-radius-lg);
  box-shadow:
    inset 0 -3px 0 var(--ek-color-border-subtle),
    0 1px 0 var(--ek-color-border-default);
  font-size: var(--ek-type-label-size);
}

.ek-keycaps--lg .ek-keycap--symbol {
  font-size: var(--ek-type-heading-size);
}

.ek-keycaps__plus,
.ek-keycaps__then,
.ek-keycaps__or {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: 1;
}

.ek-keycaps__plus {
  padding: 0 1px;
}

.ek-keycaps__or--slash {
  margin: 0 -2px;
}

.ek-keycap__icon {
  font-size: 14px;
}

.ek-keycaps--lg .ek-keycap__icon {
  font-size: 16px;
}

.ek-keycap.is-match {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  box-shadow:
    inset 0 -2px 0 var(--ek-color-action-border),
    0 1px 0 var(--ek-color-action-border);
  color: var(--ek-color-action-emphasis);
}
</style>
