<!-- Vitrin §1 — palet (primitif ölçekler) ve semantik roller (amacıyla + canlı kontrast). -->
<template>
  <DsSpecimen title="Primitif ölçekler" note="Yalnızca token dosyalarında kullanılır; bileşenler rol adlarını tüketir.">
    <div class="ds-scales">
      <div v-for="scale in scales" :key="scale.name" class="ds-scale">
        <div class="ds-scale__head">
          <span class="ds-scale__name">{{ scale.name }}</span>
          <span class="ds-scale__use">{{ scale.use }}</span>
        </div>
        <div class="ds-scale__row">
          <div v-for="step in scale.steps" :key="step.key" class="ds-swatch">
            <span class="ds-swatch__block" v-bind="bg(step.hex)" aria-hidden="true"></span>
            <span class="ds-swatch__step">{{ step.key }}</span>
            <span class="ds-swatch__hex">{{ step.hex }}</span>
          </div>
        </div>
      </div>
    </div>
  </DsSpecimen>

  <div class="ds-role-groups">
    <DsSpecimen v-for="group in groups" :key="group.id" :title="group.label">
      <ul class="ds-roles">
        <li v-for="role in group.roles" :key="role.key" class="ds-role">
          <span class="ds-role__chip" v-bind="bg(`var(--ek-color-${role.key})`)" aria-hidden="true"></span>
          <span class="ds-role__main">
            <span class="ds-role__name">
              <code>--ek-color-{{ role.key }}</code>
              <span class="ds-role__hex">{{ appSemanticColorsLight[role.key] }}</span>
            </span>
            <span class="ds-role__purpose">{{ role.purpose }}</span>
          </span>
        </li>
      </ul>
    </DsSpecimen>
  </div>

  <DsSpecimen title="Zorunlu kontrast çiftleri (WCAG AA)" :note="`${pairs.length} çift · tümü otomatik testte (tests/theme/ds-v2-tokens.test.ts)`">
    <div class="ds-pairs">
      <div v-for="p in pairsShown" :key="`${p.fg}-${p.bg}`" class="ds-pair" v-bind="bg(`var(--ek-color-${p.bg})`)">
        <span class="ds-pair__sample" v-bind="fg(`var(--ek-color-${p.fg})`)">Aa</span>
        <span class="ds-pair__meta">
          <span class="ds-pair__keys" v-bind="fg(`var(--ek-color-${p.fg})`)">{{ p.fg }}</span>
          <span class="ds-pair__on" v-bind="fg(`var(--ek-color-${p.fg})`)">zemin: {{ p.bg }}</span>
        </span>
        <span class="ds-pair__ratio">{{ p.ratio }} : 1</span>
      </div>
    </div>
  </DsSpecimen>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DsSpecimen from './DsSpecimen.vue'
import {
  ink,
  navy,
  cobalt,
  COLOR_ROLES,
  COLOR_ROLE_GROUP_LABELS,
  CONTRAST_PAIRS,
  appSemanticColorsLight,
  contrastRatio,
  type ColorRoleGroup,
} from '@/design/tokens'
import { formatNumber } from '@/composables/format'

const bg = (value: string) => ({ style: { background: value } })
const fg = (value: string) => ({ style: { color: value } })

function steps(scale: Record<string | number, string>) {
  return Object.entries(scale).map(([key, hex]) => ({ key, hex }))
}

const scales = [
  { name: 'ink', use: 'Nötr gri — metin, kenarlık, yüzey', steps: steps(ink) },
  { name: 'navy', use: 'Marka / kimlik — üst bar, logo, bölüm etiketi', steps: steps(navy) },
  { name: 'cobalt', use: 'Tek vurgu — aksiyon, seçim, odak', steps: steps(cobalt) },
]

const groups = computed(() =>
  (Object.keys(COLOR_ROLE_GROUP_LABELS) as ColorRoleGroup[]).map((id) => ({
    id,
    label: COLOR_ROLE_GROUP_LABELS[id],
    roles: COLOR_ROLES.filter((r) => r.group === id),
  })),
)

const pairs = CONTRAST_PAIRS.map((p) => ({
  ...p,
  ratio: formatNumber(Math.round(contrastRatio(appSemanticColorsLight[p.fg], appSemanticColorsLight[p.bg]) * 100) / 100),
}))

const SHOWN = new Set([
  'content-muted/app-bg',
  'content-muted/surface-sunken',
  'content-default/tabstrip-bg',
  'chrome-text-muted/chrome-end',
  'sidebar-section/sidebar-bg',
  'action-emphasis/sidebar-active',
  'action-contrast/action',
  'action/surface',
  'success-emphasis/success-subtle',
  'warning/warning-subtle',
  'error-contrast/error',
  'info-emphasis/info-subtle',
])
const pairsShown = pairs.filter((p) => SHOWN.has(`${p.fg}/${p.bg}`))
</script>

<style scoped>
.ds-scales {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}

.ds-scale__head {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-3);
  margin-bottom: var(--ek-space-2);
}

.ds-scale__name {
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-bold);
}

.ds-scale__use {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-scale__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
  gap: var(--ek-space-1);
}

.ds-swatch {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: var(--ek-color-content-strong);
}

.ds-swatch__block {
  height: 48px;
  margin-bottom: var(--ek-space-1);
  border-radius: var(--ek-radius-md);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-subtle);
}

.ds-swatch__step {
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-bold);
}

.ds-swatch__hex {
  color: var(--ek-color-content-muted);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-micro-size);
}

.ds-role-groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: var(--ek-space-4);
}

.ds-roles {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ds-role {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
}

.ds-role__chip {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: var(--ek-radius-tile);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-default);
}

.ds-role__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ds-role__name {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--ek-space-2);
}

.ds-role__name code {
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ds-role__hex {
  color: var(--ek-color-content-muted);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-micro-size);
}

.ds-role__purpose {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ds-pairs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--ek-space-3);
}

.ds-pair {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
}

.ds-pair__sample {
  font-size: var(--ek-type-title-size);
  font-weight: var(--ek-font-weight-bold);
}

.ds-pair__meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  font-size: var(--ek-type-caption-size);
}

.ds-pair__keys {
  font-weight: var(--ek-font-weight-semibold);
}

.ds-pair__ratio {
  padding: 2px var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-success-emphasis);
  box-shadow: inset 0 0 0 1px var(--ek-color-success-border);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-bold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
