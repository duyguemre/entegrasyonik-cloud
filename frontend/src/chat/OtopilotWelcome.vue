<!--
  frontend/src/chat/OtopilotWelcome.vue — Otopilot penceresinin KARŞILAMA ekranı (konuşma boşken; ChatPanel `#empty`).
  FE-LOCAL-1056 (kullanıcı kararı): "çok yazı var, ne yapacağım belli değil" → az metin, yönlendirici düzen:
    1) tek cümlelik vaat (kısa eylem çizgili mikro etiket + başlık)
    2) "Nasıl çalışır" — üç adımlık şerit: İsteyin → Otopilot hazırlar → Siz onaylarsınız
    3) "Hızlı başlangıç" — sunucunun önerdiği örnekler (info.suggestions), konu ikonuyla; tıklayınca gönderilir
  Öneri metinleri sunucudan gelir (uydurma öneri yok); ikon yalnız metindeki konuya göre seçilen bir görsel ipucudur.
  Salt-okuma oturumunda üçüncü adım "yalnız okur" olarak değişir (değişiklik önerilmez).
-->
<template>
  <div class="ow">
    <header class="ow__hero">
      <span class="ow__mark" aria-hidden="true"><v-icon :icon="CHAT_ICON" /></span>
      <div class="ow__hero-text">
        <span class="ow__eyebrow">{{ CHAT_PRODUCT.name }}</span>
        <p class="ow__title">Ne yapmak istediğinizi yazın, gerisini {{ CHAT_PRODUCT.name }} hazırlasın.</p>
      </div>
    </header>

    <ol class="ow__steps" aria-label="Nasıl çalışır">
      <li v-for="(s, i) in steps" :key="s.title" class="ow__step">
        <span class="ow__step-no ek-num" aria-hidden="true">{{ i + 1 }}</span>
        <span class="ow__step-text">
          <span class="ow__step-title">{{ s.title }}</span>
          <span class="ow__step-hint">{{ s.hint }}</span>
        </span>
      </li>
    </ol>

    <section v-if="suggestions.length" class="ow__quick" aria-labelledby="ow-quick-title">
      <h3 id="ow-quick-title" class="ow__label">Hızlı başlangıç</h3>
      <div class="ow__list">
        <button v-for="s in suggestions" :key="s.id" type="button" class="ow__item" :disabled="!chat.canCompose.value" data-otopilot-suggestion
          @click="chat.send(s.text)">
          <span class="ow__item-icon" aria-hidden="true"><v-icon :icon="iconFor(s.text)" /></span>
          <span class="ow__item-text">{{ s.text }}</span>
          <v-icon class="ow__item-go" icon="mdi-arrow-right" aria-hidden="true" />
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CHAT_ICON, CHAT_PRODUCT, useChat } from '@entegrasyonik/chat'

const chat = useChat()
/** Karşılama kalabalıklaşmasın: en çok dört öneri (kalanı yazarak sorulur). */
const suggestions = computed(() => (chat.info.value?.suggestions ?? []).slice(0, 4))

const steps = computed(() => [
  { title: 'İsteyin', hint: 'Soru sorun ya da iş verin' },
  { title: 'Hazırlasın', hint: 'Veriyi bulur, işlemi kurar' },
  chat.readOnly.value ? { title: 'Yalnız okur', hint: 'Bu oturumda değişiklik yapmaz' } : { title: 'Onaylayın', hint: 'Siz onaylamadan değişmez' },
])

/** Metindeki konuya göre görsel ipucu (yalnız ikon; anlam metinde). */
const ICONS: Array<[RegExp, string]> = [
  [/sipariş|iade|kargo/i, 'mdi-cart-outline'],
  [/stok|ürün|katalog/i, 'mdi-package-variant-closed'],
  [/fiyat|kâr|kar\b|maliyet/i, 'mdi-tag-outline'],
  [/rapor|özet|satış|ciro/i, 'mdi-chart-box-outline'],
  [/fatura|hakediş|ödeme/i, 'mdi-receipt-text-outline'],
  [/entegrasyon|kanal|pazaryeri/i, 'mdi-connection'],
]
const iconFor = (text: string) => ICONS.find(([re]) => re.test(text))?.[1] ?? 'mdi-message-question-outline'
</script>

<style scoped>
.ow {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: 0;
}

/* Vaat: işaret + tek cümle. */
.ow__hero {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}

.ow__mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  font-size: var(--ek-icon-lg);
}

.ow__hero-text {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.ow__eyebrow,
.ow__label {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ow__eyebrow::before,
.ow__label::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.ow__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  line-height: 1.35;
  font-weight: var(--ek-font-weight-semibold);
  text-wrap: balance;
}

/* Nasıl çalışır: tek şerit, hücreler ince çizgiyle ayrılır (özet şeritleriyle aynı aile). */
.ow__steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-border-subtle);
  list-style: none;
}

.ow__step {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: var(--ek-space-2);
  min-width: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  background: var(--ek-color-surface-muted);
}

.ow__step-no {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-bold);
}

.ow__step-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.ow__step-title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ow__step-hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

/* Hızlı başlangıç: tek kartta ince çizgili satırlar. */
.ow__quick {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.ow__list {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ow__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 44px;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 0;
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ow__item + .ow__item {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ow__item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-icon-sm);
}

.ow__item-go {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.ow__item:hover:not(:disabled) {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-content-strong);
}

.ow__item:hover:not(:disabled) .ow__item-icon {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}

.ow__item:hover:not(:disabled) .ow__item-go {
  color: var(--ek-color-action);
}

.ow__item:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.ow__item:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
