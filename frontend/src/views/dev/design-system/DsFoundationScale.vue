<!-- Vitrin §4 — boşluk, radius, gölge, hareket ve z-index ölçekleri. -->
<template>
  <div class="ds-scale-grid">
    <DsSpecimen title="Boşluk (4 px taban)" note="sayfa 24 · bölüm 32 · kart içi 20 · form alanı 16 · satır içi 8">
      <div class="ds-space">
        <div v-for="(px, key) in space" :key="key" class="ds-space__row">
          <code>space-{{ key }}</code>
          <span class="ds-space__bar" v-bind="width(px)" aria-hidden="true"></span>
          <span class="ds-space__px">{{ px }}</span>
        </div>
      </div>
    </DsSpecimen>

    <DsSpecimen title="Radius rolleri" note="Bileşenler ölçek adını değil rolü kullanır.">
      <div class="ds-radius">
        <div v-for="(scaleKey, role) in radiusRole" :key="role" class="ds-radius__cell">
          <span class="ds-radius__box" v-bind="radiusOf(scaleKey)" aria-hidden="true"></span>
          <code>{{ role }}</code>
          <span>{{ scaleKey }} · {{ radiusPx(scaleKey) }}</span>
        </div>
      </div>
    </DsSpecimen>
  </div>

  <div class="ds-scale-grid">
    <DsSpecimen title="Gölge / yükseklik" note="Lacivert-mürekkep tonlu, yumuşak. Kart = card; açılan katman = popover; diyalog = dialog." canvas>
      <div class="ds-shadows">
        <div v-for="s in shadows" :key="s" class="ds-shadows__card" :class="`ds-shadows__card--${s}`">
          <code>shadow-{{ s }}</code>
        </div>
      </div>
    </DsSpecimen>

    <DsSpecimen title="Hareket" note="Kısa fade + ≤8 px slide; hover'da kayma/ölçek yok. Azaltılmış hareket tercihinde süreler 0.">
      <ul class="ds-motion">
        <li v-for="(ms, key) in duration" :key="key"><code>duration-{{ key }}</code><span>{{ ms }} ms</span></li>
        <li v-for="(e, key) in easing" :key="key"><code>easing-{{ key }}</code><span>{{ e }}</span></li>
        <li v-for="(px, key) in motionDistance" :key="key"><code>motion-distance-{{ key }}</code><span>{{ px }} px</span></li>
      </ul>
      <div class="ds-motion__demo">
        <EkButton tone="secondary" size="sm" icon="mdi-play-outline" @click="shown = !shown">{{ shown ? 'Gizle' : 'Önizle' }}</EkButton>
        <Transition name="ds-fade-slide">
          <div v-if="shown" class="ds-motion__panel">Açılan katman: fade + 4 px slide · 200 ms</div>
        </Transition>
      </div>
    </DsSpecimen>

    <DsSpecimen title="Katman (z-index)" note="Kendi yüzen katmanlarımız; Vuetify overlay'leri 2000'den başlar.">
      <ul class="ds-motion">
        <li v-for="(z, key) in zIndex" :key="key"><code>z-{{ key }}</code><span>{{ z }}</span></li>
      </ul>
    </DsSpecimen>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import DsSpecimen from './DsSpecimen.vue'
import EkButton from '@/components/ds/EkButton.vue'
import { space, radius, radiusRole, duration, easing, motionDistance, zIndex } from '@/design/tokens'

const shown = ref(false)
const shadows = ['card', 'raised', 'popover', 'dialog']
const width = (px: number) => ({ style: { width: `${Math.max(px, 1)}px` } })
const radiusOf = (key: keyof typeof radius) => ({ style: { borderRadius: `var(--ek-radius-${key})` } })
const radiusPx = (key: keyof typeof radius) => (radius[key] > 100 ? 'hap' : `${radius[key]}px`)
</script>

<style scoped>
.ds-scale-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--ek-space-4);
}

.ds-space {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.ds-space__row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) 32px;
  align-items: center;
  gap: var(--ek-space-3);
}

.ds-space__row code,
.ds-radius__cell code,
.ds-motion code,
.ds-shadows code {
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
}

.ds-space__bar {
  height: 12px;
  border-radius: 2px;
  background: var(--ek-color-action-border);
  box-shadow: inset 0 0 0 1px var(--ek-color-action);
}

.ds-space__px {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.ds-radius {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: var(--ek-space-4);
}

.ds-radius__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-radius__box {
  width: 64px;
  height: 48px;
  margin-bottom: var(--ek-space-2);
  background: var(--ek-color-action-subtle);
  border: 1px solid var(--ek-color-action-border);
}

.ds-shadows {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-5);
}

.ds-shadows__card {
  display: flex;
  align-items: flex-end;
  height: 72px;
  padding: var(--ek-space-3);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
}

.ds-shadows__card--card { box-shadow: var(--ek-shadow-card); }
.ds-shadows__card--raised { box-shadow: var(--ek-shadow-raised); }
.ds-shadows__card--popover { box-shadow: var(--ek-shadow-popover); }
.ds-shadows__card--dialog { box-shadow: var(--ek-shadow-dialog); }

.ds-motion {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ds-motion li {
  display: flex;
  justify-content: space-between;
  gap: var(--ek-space-3);
  padding: var(--ek-space-1) 0;
  border-bottom: 1px dashed var(--ek-color-border-subtle);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-motion__demo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-3);
  min-height: 88px;
  margin-top: var(--ek-space-4);
}

.ds-motion__panel {
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-popover);
  background: var(--ek-color-surface-raised);
  box-shadow: var(--ek-shadow-popover);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
}

.ds-fade-slide-enter-active,
.ds-fade-slide-leave-active {
  transition: opacity var(--ek-duration-base) var(--ek-easing-enter), transform var(--ek-duration-base) var(--ek-easing-enter);
}

.ds-fade-slide-enter-from,
.ds-fade-slide-leave-to {
  opacity: 0;
  transform: translateY(calc(var(--ek-motion-distance-sm) * -1));
}
</style>
