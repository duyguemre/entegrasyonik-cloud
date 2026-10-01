<!--
  ShortcutsDialog — "?" ile açılan kısayol yardımı (BO-ELEV E2, CONSOLE_IDENTITY ilke 4).
  Gezinme satırları ekran kaydındaki `hotkey` alanından gelir (HOTKEYS); yeni ekran kısayolu kayıtta bir harftir.
  Esc kapatır; odak diyalogda tutulur (v-dialog).
-->
<template>
  <v-dialog v-model="open" max-width="720" content-class="bo-keys-wrap" aria-label="Klavye kısayolları">
    <section class="bo-keys">
      <header class="bo-keys__head">
        <h2 class="bo-keys__title">Klavye kısayolları</h2>
        <button type="button" class="bo-keys__close" aria-label="Kapat" @click="open = false"><v-icon icon="mdi-close" aria-hidden="true" /></button>
      </header>
      <div class="bo-keys__body">
        <div class="bo-keys__col">
          <h3 class="bo-keys__group">Genel</h3>
          <dl class="bo-keys__list">
            <div v-for="k in GENERAL" :key="k.label" class="bo-keys__row">
              <dt>{{ k.label }}</dt>
              <dd><EkKbd v-for="(combo, i) in k.keys" :key="i" :keys="combo" /></dd>
            </div>
          </dl>
        </div>
        <div class="bo-keys__col">
          <h3 class="bo-keys__group">Ekrana git <span class="bo-keys__note">önce <EkKbd :keys="['G']" />, sonra harf</span></h3>
          <dl class="bo-keys__list">
            <div v-for="h in HOTKEYS" :key="h.key" class="bo-keys__row">
              <dt>{{ h.screen.label }}</dt>
              <dd><EkKbd :keys="['G', h.key.toUpperCase()]" /></dd>
            </div>
          </dl>
        </div>
      </div>
      <p class="bo-keys__foot">Kısayollar metin alanı dışındayken çalışır. Mac'te Ctrl yerine ⌘.</p>
    </section>
  </v-dialog>
</template>

<script setup lang="ts">
import { EkKbd } from '@entegrasyonik/ui/components'
import { HOTKEYS } from '@bo/navigation/screens'
import { CHAT_PRODUCT } from '@entegrasyonik/chat/brand'

const open = defineModel<boolean>({ default: false })

const GENERAL: Array<{ label: string; keys: string[][] }> = [
  { label: 'Komut paleti', keys: [['Ctrl', 'K'], ['/']] },
  { label: `${CHAT_PRODUCT.name} paneli`, keys: [['Ctrl', 'J']] },
  { label: 'Sayfa verisini yenile', keys: [['Alt', 'R']] },
  { label: 'Tabloda sonraki / önceki satır', keys: [['J'], ['K']] },
  { label: 'Satırı aç', keys: [['Enter']] },
  { label: 'Bu yardım', keys: [['?']] },
  { label: 'Diyalog, palet ya da menüyü kapat', keys: [['Esc']] },
]
</script>

<style>
/* Teleport edilir → scoped değil; yalnız .bo-keys ile sınırlı. */
.bo-keys-wrap {
  align-self: flex-start;
  margin-top: 10vh;
}

.bo-keys {
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-dialog);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-dialog);
}

.bo-keys__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.bo-keys__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-keys__close {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--ek-radius-control);
  background: none;
  color: var(--ek-color-content-muted);
  cursor: pointer;
}

.bo-keys__close:hover {
  background: var(--ek-color-surface-muted);
}

.bo-keys__close:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-keys__body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-6);
  max-height: 60vh;
  overflow-y: auto;
  padding: var(--ek-space-4);
}

.bo-keys__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-keys__note {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-weight: var(--ek-font-weight-regular);
  letter-spacing: 0;
  text-transform: none;
}

.bo-keys__list {
  margin: 0;
}

.bo-keys__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  min-height: 32px;
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.bo-keys__row dt {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.bo-keys__row dd {
  display: inline-flex;
  gap: var(--ek-space-2);
  margin: 0;
}

.bo-keys__foot {
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

@media (max-width: 599px) {
  .bo-keys__body {
    grid-template-columns: 1fr;
    gap: var(--ek-space-4);
  }
}
</style>
