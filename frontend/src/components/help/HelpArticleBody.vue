<!--
  frontend/src/components/help/HelpArticleBody.vue — yardım makalesi gövdesi (`help/types.ts` HelpBlock).
  Otomatik bloklar elle kopya değildir: kısayollar → `navigation/shortcuts.ts`, entegrasyon hataları →
  `composables/useIntegrationError.ts`, kanal rehberi → `help/channels.ts` (`help/autoBlocks.ts`).
-->
<template>
  <div class="ek-help-body">
    <template v-for="(block, i) in blocks" :key="i">
      <p v-if="block.type === 'p'" class="ek-help-body__p"><HelpText :text="block.text" /></p>

      <h3 v-else-if="block.type === 'h'" class="ek-help-body__h"><HelpText :text="block.text" /></h3>

      <ol v-else-if="block.type === 'steps'" class="ek-help-body__steps">
        <li v-for="(item, j) in block.items" :key="j"><span class="ek-help-body__step-no ek-num" aria-hidden="true">{{ j + 1 }}</span><span><HelpText :text="item" /></span></li>
      </ol>

      <ul v-else-if="block.type === 'list'" class="ek-help-body__list">
        <li v-for="(item, j) in block.items" :key="j"><HelpText :text="item" /></li>
      </ul>

      <div v-else-if="block.type === 'note'" class="ek-help-body__note" :class="`is-${block.tone}`" role="note">
        <v-icon :icon="NOTE_ICON[block.tone]" aria-hidden="true" />
        <p><span class="ek-sr-only">{{ NOTE_LABEL[block.tone] }}: </span><HelpText :text="block.text" /></p>
      </div>

      <div v-else-if="block.type === 'table'" class="ek-help-body__table-wrap">
        <table class="ek-help-body__table">
          <thead><tr><th v-for="(h, j) in block.head" :key="j" scope="col">{{ h }}</th></tr></thead>
          <tbody>
            <tr v-for="(row, r) in block.rows" :key="r">
              <td v-for="(cell, c) in row" :key="c" :data-label="block.head[c]"><HelpText :text="cell" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="block.type === 'shortcuts'" class="ek-help-body__shortcuts" data-help-auto="shortcuts">
        <section v-for="group in shortcutGroups" :key="group.label" class="ek-help-body__sc-group">
          <h3 class="ek-help-body__micro">{{ group.label }}</h3>
          <dl class="ek-help-body__sc-list">
            <div v-for="row in group.rows" :key="row.label" class="ek-help-body__sc-row" data-shortcut-row>
              <dt>
                {{ row.label }}
                <span v-if="row.inEditable" class="ek-help-body__sc-flag">yazarken de çalışır</span>
              </dt>
              <dd>
                <EkKbd :keys="row.keys" />
                <template v-for="(alias, a) in row.aliases" :key="a"><span class="ek-help-body__sc-or">ya da</span><EkKbd :keys="alias" /></template>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div v-else-if="block.type === 'integrationErrors'" class="ek-help-body__errors" data-help-auto="integrationErrors">
        <article v-for="row in errorRows" :key="row.id" class="ek-help-body__error">
          <header>
            <v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />
            <h3>{{ row.title }}</h3>
          </header>
          <p class="ek-help-body__error-when">{{ row.when }}</p>
          <dl>
            <div><dt>Olası neden</dt><dd>{{ row.cause }}</dd></div>
            <div><dt>Ne yapmalı</dt><dd>{{ row.action }}</dd></div>
          </dl>
          <p class="ek-help-body__error-actions">
            <span v-if="row.retry" class="ek-help-body__pill">Panelde: Tekrar dene</span>
            <span v-if="row.settings" class="ek-help-body__pill">Panelde: Entegrasyon ayarına git</span>
          </p>
        </article>
      </div>

      <div v-else-if="block.type === 'channelGuides'" class="ek-help-body__channels" data-help-auto="channelGuides">
        <article v-for="ch in channelRows" :key="ch.code" class="ek-help-body__channel" :class="`ek-ch-${ch.code}`" :data-channel="ch.code">
          <header>
            <EkPlatformMark :name="ch.name" :code="ch.code" :show-name="false" />
            <div>
              <h3>{{ ch.name }}</h3>
              <span class="ek-help-body__kind">{{ KIND_LABEL[ch.kind] }}</span>
            </div>
          </header>
          <p class="ek-help-body__micro">Gerekli bilgiler</p>
          <ul class="ek-help-body__creds">
            <li v-for="c in ch.credentials" :key="c"><v-icon icon="mdi-key-variant" aria-hidden="true" />{{ c }}</li>
          </ul>
          <p class="ek-help-body__micro">Nereden alınır</p>
          <p class="ek-help-body__where">{{ ch.steps[0] }}</p>
          <p v-if="ch.note" class="ek-help-body__channel-note"><v-icon icon="mdi-information-outline" aria-hidden="true" />{{ ch.note }}</p>
          <EkButton
            v-if="nav.canOpenScreen(HELP_CHANNEL_SCREEN[ch.kind])"
            tone="secondary" size="sm" trailing-icon="mdi-arrow-right"
            @click="nav.openScreen(HELP_CHANNEL_SCREEN[ch.kind])"
          >Ayar ekranını aç</EkButton>
        </article>
      </div>

      <div v-else-if="block.type === 'faq'" class="ek-help-body__faq">
        <details v-for="(item, j) in block.items" :key="j" class="ek-help-body__faq-item">
          <summary><span><HelpText :text="item.q" /></span><v-icon icon="mdi-chevron-down" aria-hidden="true" /></summary>
          <p><HelpText :text="item.a" /></p>
        </details>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkKbd from '@/components/ds/EkKbd.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue'
import HelpText from './HelpText.vue'
import type { HelpBlock } from '@/help/types'
import { channelGuideRows, integrationErrorRows, shortcutRows } from '@/help/autoBlocks'
import { HELP_CHANNEL_SCREEN } from '@/help/channels'
import { useHelpNavigation } from '@/help/useHelpNavigation'

defineProps<{ blocks: HelpBlock[] }>()

const nav = useHelpNavigation()

const NOTE_ICON = { info: 'mdi-information-outline', warning: 'mdi-alert-outline', success: 'mdi-check-circle-outline' } as const
const NOTE_LABEL = { info: 'Bilgi', warning: 'Dikkat', success: 'İpucu' } as const
const KIND_LABEL = { marketplace: 'Pazaryeri', ecommerce: 'E-ticaret', erp: 'ERP / ön muhasebe' } as const

const shortcutGroups = computed(() => {
  const groups = new Map<string, ReturnType<typeof shortcutRows>>()
  for (const row of shortcutRows()) {
    if (!groups.has(row.group)) groups.set(row.group, [])
    groups.get(row.group)!.push(row)
  }
  return [...groups.entries()].map(([label, rows]) => ({ label, rows }))
})
const errorRows = integrationErrorRows()
const channelRows = channelGuideRows()
</script>

<style scoped>
.ek-help-body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: 1.65;
}

.ek-help-body p {
  margin: 0;
}

.ek-help-body__h {
  margin: var(--ek-space-2) 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-body__micro {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

/* Adımlar: numaralı yuvarlak + metin; aralarında ince çizgi (yol hissi). */
.ek-help-body__steps {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: none;
}

.ek-help-body__steps li {
  position: relative;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: var(--ek-space-3);
  padding-bottom: var(--ek-space-3);
}

.ek-help-body__steps li:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 30px;
  bottom: 2px;
  left: 13.5px;
  width: 1px;
  background: var(--ek-color-border-default);
}

.ek-help-body__step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-body__steps li > span:last-child {
  padding-top: 2px;
}

.ek-help-body__list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding-left: var(--ek-space-5);
}

.ek-help-body__list li::marker {
  color: var(--ek-color-content-subtle);
}

.ek-help-body__note {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-info-subtle);
}

.ek-help-body__note .v-icon {
  margin-top: 3px;
  font-size: 20px;
  color: var(--ek-color-info-emphasis);
}

.ek-help-body__note.is-warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
}

.ek-help-body__note.is-warning .v-icon {
  color: var(--ek-color-warning-emphasis);
}

.ek-help-body__note.is-success {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
}

.ek-help-body__note.is-success .v-icon {
  color: var(--ek-color-success-emphasis);
}

.ek-help-body__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
}

.ek-help-body__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ek-type-table-size);
  line-height: 1.5;
}

.ek-help-body__table th {
  padding: var(--ek-space-2) var(--ek-space-3);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-align: left;
  text-transform: uppercase;
}

.ek-help-body__table td {
  padding: var(--ek-space-2) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  vertical-align: top;
}

.ek-help-body__table td:first-child {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

/* Kısayollar */
.ek-help-body__shortcuts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-4);
}

.ek-help-body__sc-group {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-help-body__sc-list {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.ek-help-body__sc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) 0;
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-help-body__sc-row:first-child {
  border-top: 0;
}

.ek-help-body__sc-row dt {
  font-size: var(--ek-type-table-size);
  line-height: 1.45;
}

.ek-help-body__sc-flag {
  display: block;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-help-body__sc-row dd {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-1);
  margin: 0;
}

.ek-help-body__sc-or {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* Entegrasyon hataları */
.ek-help-body__errors,
.ek-help-body__channels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-3);
}

.ek-help-body__error,
.ek-help-body__channel {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-help-body__error header,
.ek-help-body__channel header {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-help-body__error header .v-icon {
  font-size: 18px;
  color: var(--ek-color-error-emphasis);
}

.ek-help-body__error h3,
.ek-help-body__channel h3 {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-body__error-when,
.ek-help-body__kind {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-help-body__error dl {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-type-table-size);
  line-height: 1.5;
}

.ek-help-body__error dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-help-body__error dd {
  margin: 0;
}

.ek-help-body__error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  margin-top: auto !important;
}

.ek-help-body__pill {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-neutral-border);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-neutral-subtle);
  color: var(--ek-color-neutral-emphasis);
  font-size: var(--ek-type-caption-size);
}

/* Kanal rehberi — kanal rengi sol şerit (`.ek-ch-<kod>` kapsam token'ları). */
.ek-help-body__channel {
  border-left: 3px solid var(--ek-ch-solid, var(--ek-color-border-default));
}

.ek-help-body__channel header > div {
  display: flex;
  flex-direction: column;
}

.ek-help-body__creds {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-help-body__creds li {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: 24px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-help-body__creds .v-icon {
  font-size: 14px;
  color: var(--ek-color-content-muted);
}

.ek-help-body__where {
  font-size: var(--ek-type-table-size);
  line-height: 1.5;
}

.ek-help-body__channel-note {
  display: flex;
  gap: var(--ek-space-2);
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: 1.5;
}

.ek-help-body__channel-note .v-icon {
  font-size: 16px;
}

.ek-help-body__channel .ek-btn {
  align-self: flex-start;
  margin-top: auto;
}

/* SSS — yerel <details>: klavye (Enter/Boşluk) ve ekran okuyucu desteği hazır. */
.ek-help-body__faq {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-help-body__faq-item + .ek-help-body__faq-item {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-help-body__faq-item summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  min-height: 48px;
  padding: var(--ek-space-2) var(--ek-space-4);
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
  list-style: none;
}

.ek-help-body__faq-item summary::-webkit-details-marker {
  display: none;
}

.ek-help-body__faq-item summary .v-icon {
  flex: none;
  color: var(--ek-color-content-muted);
  transition: transform var(--ek-duration-fast) var(--ek-easing-standard);
}

.ek-help-body__faq-item[open] summary .v-icon {
  transform: rotate(180deg);
}

.ek-help-body__faq-item summary:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
  border-radius: var(--ek-radius-card);
}

.ek-help-body__faq-item p {
  padding: 0 var(--ek-space-4) var(--ek-space-4);
  color: var(--ek-color-content-default);
}

@media (max-width: 719px) {
  .ek-help-body__shortcuts,
  .ek-help-body__errors,
  .ek-help-body__channels {
    grid-template-columns: minmax(0, 1fr);
  }

  /* Dar ekranda tablo satırı = etiketli kart. */
  .ek-help-body__table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .ek-help-body__table tr {
    display: block;
    padding: var(--ek-space-2) var(--ek-space-3);
    border-top: 1px solid var(--ek-color-border-subtle);
  }

  .ek-help-body__table tr:first-child {
    border-top: 0;
  }

  .ek-help-body__table td {
    display: block;
    padding: var(--ek-space-1) 0;
    border: 0;
  }

  .ek-help-body__table td::before {
    content: attr(data-label);
    display: block;
    color: var(--ek-color-content-muted);
    font-size: var(--ek-type-micro-size);
    font-weight: var(--ek-type-micro-weight);
    letter-spacing: var(--ek-type-micro-tracking);
    text-transform: uppercase;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ek-help-body__faq-item summary .v-icon {
    transition: none;
  }
}
</style>
