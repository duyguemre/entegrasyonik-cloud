<!--
  frontend/src/components/printouts/TemplateEditor.vue

  FR3 madde 15 (fe-r3c) — şablon düzenleyici. Bilgi mimarisi (araştırma 12):
    üst çubuk: geri · ad · kaydedilmedi durumu · geri al/yinele · yakınlaştırma · ızgara · Önizle · Kaydet
    sol: Alanlar (aranabilir, gruplu, örnek değerli) / Bileşenler (metin, barkod, QR, tablo, çizgi, çerçeve)
    orta: tuval (mm, ızgara + kenar boşluğu kılavuzu, seçim/yeniden boyutlandırma tutamacı), alt durum çubuğu
    sağ: seçili öğenin özellikleri; seçim yoksa belge ayarları, katmanlar, denetim ve kısayollar.
  Ekleme: alan/bileşene TIKLA (klavye: Enter) ya da tuvale SÜRÜKLE. Tuvaldeki öğe Tab ile odaklanır.
  Kısayollar: oklar 1 mm (Shift 5 mm) · Del sil · Ctrl+D çoğalt · Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) · Esc · Ctrl+S ·
  + / − yakınlaştır · Ctrl+0 sığdır. Alt basılıyken sürükleme ızgaraya yapışmaz.
  Dar ekranda (< md) paneller tek sütunda sekmeyle değişir (Ekle · Tuval · Özellikler).
-->
<template>
  <section ref="root" class="ek-tpl-editor" :class="{ 'is-narrow': narrow, 'is-compact': compact }" aria-label="Şablon düzenleyici">
    <!-- Üst çubuk -->
    <header class="ek-tpl-editor__bar">
      <EkButton tone="ghost" icon="mdi-arrow-left" @click="emit('close')">Şablonlar</EkButton>
      <div class="ek-tpl-editor__title">
        <v-text-field v-model="doc.name" class="ek-tpl-editor__name" label="Şablon adı" hide-details maxlength="60" @blur="commit()" />
        <EkBadge :text="docKindLabel(doc.kind)" tone="neutral" />
        <span class="ek-tpl-editor__state" :class="{ 'is-dirty': dirty }" role="status">
          <v-icon :icon="dirty ? 'mdi-circle-medium' : 'mdi-check'" size="16" aria-hidden="true" />{{ dirty ? 'Kaydedilmedi' : 'Kaydedildi' }}
        </span>
      </div>
      <div class="ek-tpl-editor__tools" role="toolbar" aria-label="Düzenleyici araçları">
        <EkTooltip text="Geri al" :shortcut="['Ctrl', 'Z']">
          <EkButton tone="ghost" icon-only icon="mdi-undo" aria-label="Geri al" :disabled="!canUndo" @click="undo" />
        </EkTooltip>
        <EkTooltip text="Yinele" :shortcut="['Ctrl', 'Shift', 'Z']">
          <EkButton tone="ghost" icon-only icon="mdi-redo" aria-label="Yinele" :disabled="!canRedo" @click="redo" />
        </EkTooltip>
        <span class="ek-tpl-editor__sep" aria-hidden="true" />
        <EkButton tone="ghost" icon-only icon="mdi-magnify-minus-outline" aria-label="Uzaklaştır" @click="zoomBy(-0.25)" />
        <button type="button" class="ek-tpl-editor__zoom" :aria-label="`Yakınlaştırma yüzde ${Math.round(zoom * 100)}, sığdırmak için tıklayın`" @click="fitZoom">{{ Math.round(zoom * 100) }}%</button>
        <EkButton tone="ghost" icon-only icon="mdi-magnify-plus-outline" aria-label="Yakınlaştır" @click="zoomBy(0.25)" />
        <EkTooltip text="Izgaraya yapış (sürüklerken Alt ile geçici kapanır)">
          <EkButton :tone="grid ? 'secondary' : 'ghost'" icon-only icon="mdi-grid" :aria-pressed="grid" aria-label="Izgara" @click="grid = !grid" />
        </EkTooltip>
      </div>
      <div class="ek-tpl-editor__actions">
        <EkButton tone="secondary" icon="mdi-eye-outline" @click="emit('preview', snapshot())">Önizle</EkButton>
        <EkButton intent="save" @click="save" />
      </div>
    </header>

    <!-- Dar ekran: panel seçimi -->
    <EkPageTabs v-if="narrow" v-model="pane" dense label="Düzenleyici bölümleri" class="ek-tpl-editor__panes"
      :tabs="[{ value: 'add', label: 'Ekle', icon: 'mdi-plus' }, { value: 'canvas', label: 'Tuval', icon: 'mdi-file-outline' }, { value: 'props', label: 'Özellikler', icon: 'mdi-tune-variant' }]" />

    <div class="ek-tpl-editor__body">
      <!-- SOL: alanlar / bileşenler -->
      <aside v-show="!narrow || pane === 'add'" class="ek-tpl-editor__left" aria-label="Eklenebilecekler">
        <EkPageTabs v-model="leftTab" dense label="Ekle" :tabs="[{ value: 'fields', label: 'Alanlar', count: FIELDS.length }, { value: 'blocks', label: 'Bileşenler' }]" />
        <div v-if="leftTab === 'fields'" class="ek-tpl-editor__scroll">
          <v-text-field v-model="fieldQuery" class="ek-tpl-editor__search" label="Alan ara" prepend-inner-icon="mdi-magnify" clearable hide-details />
          <p class="ek-tpl-editor__hint">Tıklayın ya da tuvale sürükleyin. Değerler {{ sample.label.toLocaleLowerCase('tr-TR') }} verisinden.</p>
          <EkEmptyState v-if="!fieldGroups.length" variant="no-results" title="Alan bulunamadı" message="Başka bir kelime deneyin: adres, takip, toplam…" />
          <section v-for="g in fieldGroups" :key="g.group" class="ek-tpl-editor__group">
            <h3 class="ek-tpl-editor__group-title">{{ g.group }}</h3>
            <ul class="ek-tpl-editor__list">
              <li v-for="f in g.fields" :key="f.path">
                <button type="button" class="ek-tpl-palette-item" draggable="true" :data-path="f.path"
                  :aria-label="`${f.label} alanını ekle`" @click="addField(f.path)" @dragstart="onPaletteDrag($event, 'field', f.path)">
                  <v-icon icon="mdi-code-braces" size="16" class="ek-tpl-palette-item__icon" aria-hidden="true" />
                  <span class="ek-tpl-palette-item__text">
                    <span class="ek-tpl-palette-item__label">{{ f.label }}</span>
                    <span class="ek-tpl-palette-item__sample">{{ resolveField(f.path, sample) || '—' }}</span>
                  </span>
                  <EkBadge v-if="f.code" text="kod" tone="neutral" />
                </button>
              </li>
            </ul>
          </section>
        </div>
        <div v-else class="ek-tpl-editor__scroll">
          <p class="ek-tpl-editor__hint">Barkod ve QR bir alana bağlanır; değer siparişten gelir.</p>
          <ul class="ek-tpl-editor__blocks">
            <li v-for="b in ELEMENT_KINDS" :key="b.id">
              <button type="button" class="ek-tpl-block" draggable="true" :aria-label="`${b.label} ekle`"
                @click="addBlock(b.id)" @dragstart="onPaletteDrag($event, b.id)">
                <EkIconTile :icon="b.icon" tone="neutral" size="sm" />
                <span class="ek-tpl-block__text"><strong>{{ b.label }}</strong><span>{{ b.hint }}</span></span>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      <!-- ORTA: tuval -->
      <div v-show="!narrow || pane === 'canvas'" class="ek-tpl-editor__center">
        <div ref="viewport" class="ek-tpl-canvas" tabindex="-1" role="region" aria-label="Tuval — öğeleri Tab ile seçin, oklarla taşıyın"
          @dragover.prevent="onDragOver" @drop.prevent="onDrop">
          <div class="ek-tpl-canvas__frame" :data-frame="key" @pointerdown="onPointerDown" @focusin="onFocusIn">
            <div class="ek-tpl-canvas__page">
              <TemplatePage :doc="doc" :data="sample" :page-key="key" design :name-of="elementName" />
            </div>
            <div class="ek-tpl-canvas__margin" aria-hidden="true" />
            <div v-if="grid" class="ek-tpl-canvas__grid" aria-hidden="true" />
            <div v-for="i in issueBoxes" :key="i" class="ek-tpl-canvas__issue" :data-issue="i" aria-hidden="true" />
            <div v-if="selected" class="ek-tpl-canvas__sel" aria-hidden="true">
              <span class="ek-tpl-canvas__size">{{ round1(selected.w) }} × {{ round1(selected.h) }} mm</span>
              <span class="ek-tpl-canvas__handle" data-handle="se" />
            </div>
          </div>
        </div>
        <footer class="ek-tpl-editor__status">
          <span>{{ paperLabel(doc.paper) }}</span>
          <span v-if="selected" class="ek-tpl-editor__pos">X {{ round1(selected.x) }} · Y {{ round1(selected.y) }} mm</span>
          <v-spacer />
          <label class="ek-tpl-editor__sample">
            <span>Örnek veri</span>
            <select v-model="sampleId" aria-label="Tuvaldeki örnek veri">
              <option v-for="s in SAMPLE_SETS" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </label>
          <button type="button" class="ek-tpl-editor__issues" :class="issueTone" @click="showChecks">
            <v-icon :icon="errors ? 'mdi-alert-circle-outline' : warnings ? 'mdi-alert-outline' : 'mdi-check-circle-outline'" size="16" aria-hidden="true" />
            {{ errors ? `${errors} hata` : '' }}{{ errors && warnings ? ' · ' : '' }}{{ warnings ? `${warnings} uyarı` : '' }}{{ !errors && !warnings ? 'Sorun yok' : '' }}
          </button>
        </footer>
      </div>

      <!-- SAĞ: özellikler -->
      <aside v-show="!narrow || pane === 'props'" ref="propsPanel" class="ek-tpl-editor__right" aria-label="Özellikler">
        <div class="ek-tpl-editor__scroll">
          <template v-if="selected">
            <div class="ek-tpl-props__head">
              <EkIconTile :icon="kindIcon(selected.kind)" tone="action" size="sm" />
              <div class="ek-tpl-props__name">
                <strong>{{ elementKindLabel(selected.kind) }}</strong>
                <span>{{ elementName(selected) }}</span>
              </div>
              <EkButton tone="ghost" icon-only icon="mdi-close" aria-label="Seçimi kaldır (Esc)" @click="select(null)" />
            </div>

            <EkFormSection :columns="1" title="Konum ve boyut" class="ek-tpl-props__section">
              <div class="ek-tpl-props__grid4">
                <v-text-field v-for="k in (['x', 'y', 'w', 'h'] as const)" :key="k" :label="GEOM_LABEL[k]" type="number" step="0.5" suffix="mm" hide-details
                  :model-value="round1(selected[k])" @update:model-value="(v: string) => setGeom(k, v)" @blur="commit()" />
              </div>
              <div class="ek-tpl-props__align" role="group" aria-label="Kâğıda hizala">
                <EkButton v-for="a in ALIGNS" :key="a.id" tone="ghost" size="sm" icon-only :icon="a.icon" :aria-label="a.label" :title="a.label" @click="alignSelected(a.id)" />
              </div>
            </EkFormSection>

            <EkFormSection :columns="1" v-if="selected.kind === 'text'" title="Metin" class="ek-tpl-props__section">
              <v-textarea :model-value="selected.text" label="Yazı" rows="2" auto-grow hide-details @update:model-value="(v: string) => patch({ text: v })" @blur="commit()" />
            </EkFormSection>

            <EkFormSection :columns="1" v-if="selected.kind === 'field' || selected.kind === 'barcode' || selected.kind === 'qr'" title="Veri" class="ek-tpl-props__section">
              <v-select :model-value="selected.path" :items="bindableFields(selected.kind)" item-title="label" item-value="path" label="Bağlı alan" hide-details
                @update:model-value="(v: string) => { patch({ path: v }); commit() }" />
              <v-text-field v-if="selected.kind === 'field'" :model-value="selected.prefix" label="Ön ek (isteğe bağlı)" placeholder="örn. Tel:" hide-details
                @update:model-value="(v: string) => patch({ prefix: v ?? '' })" @blur="commit()" />
              <p class="ek-tpl-props__value">Örnek: <strong>{{ resolveField(selected.path, sample) || 'bu siparişte boş' }}</strong></p>
            </EkFormSection>

            <EkFormSection :columns="1" v-if="selected.kind === 'text' || selected.kind === 'field'" title="Yazı biçimi" class="ek-tpl-props__section">
              <div class="ek-tpl-props__grid2">
                <v-text-field :model-value="selected.fontSize" label="Punto" type="number" min="5" max="48" suffix="pt" hide-details
                  @update:model-value="(v: string) => patch({ fontSize: clampNum(v, 5, 48) })" @blur="commit()" />
                <div class="ek-tpl-seg" role="group" aria-label="Hizalama">
                  <button v-for="a in TEXT_ALIGNS" :key="a.id" type="button" :aria-pressed="selected.align === a.id" :aria-label="a.label" :title="a.label"
                    @click="patch({ align: a.id }); commit()"><v-icon :icon="a.icon" size="18" aria-hidden="true" /></button>
                </div>
              </div>
              <v-switch :model-value="selected.bold" label="Kalın" hide-details color="primary" @update:model-value="(v: boolean | null) => { patch({ bold: !!v }); commit() }" />
              <v-switch :model-value="!!selected.uppercase" label="Büyük harf" hide-details color="primary" @update:model-value="(v: boolean | null) => { patch({ uppercase: !!v }); commit() }" />
            </EkFormSection>

            <EkFormSection :columns="1" v-if="selected.kind === 'barcode'" title="Barkod" class="ek-tpl-props__section">
              <div class="ek-tpl-seg ek-tpl-seg--text" role="group" aria-label="Barkod türü">
                <button v-for="s in (['code128', 'ean13'] as const)" :key="s" type="button" :aria-pressed="selected.symbology === s" @click="patch({ symbology: s }); commit()">{{ s === 'code128' ? 'Code128' : 'EAN-13' }}</button>
              </div>
              <v-switch :model-value="selected.showText" label="Barkodun altında okunur metin" hide-details color="primary" @update:model-value="(v: boolean | null) => { patch({ showText: !!v }); commit() }" />
              <p class="ek-tpl-props__value">Kargo firmaları için en az 30 × 8 mm önerilir; pazaryerinin verdiği kargo barkodunu kullanın.</p>
            </EkFormSection>

            <EkFormSection :columns="1" v-if="selected.kind === 'line' || selected.kind === 'box'" title="Çizgi" class="ek-tpl-props__section">
              <v-text-field :model-value="selected.thickness" label="Kalınlık" type="number" step="0.1" min="0.1" max="3" suffix="mm" hide-details
                @update:model-value="(v: string) => patch({ thickness: clampNum(v, 0.1, 3) })" @blur="commit()" />
              <v-switch v-if="selected.kind === 'line'" :model-value="selected.dashed" label="Kesikli" hide-details color="primary" @update:model-value="(v: boolean | null) => { patch({ dashed: !!v }); commit() }" />
            </EkFormSection>

            <EkFormSection :columns="1" v-if="selected.kind === 'items'" title="Kalem tablosu" class="ek-tpl-props__section">
              <fieldset class="ek-tpl-props__cols">
                <legend>Sütunlar</legend>
                <v-checkbox v-for="c in ITEM_COLUMNS" :key="c.id" :model-value="selected.columns.includes(c.id)" :label="c.id === 'check' ? 'Toplandı kutusu' : c.label" hide-details density="compact"
                  @update:model-value="(v: boolean | null) => toggleColumn(c.id, !!v)" />
              </fieldset>
              <div class="ek-tpl-props__grid2">
                <v-text-field :model-value="selected.fontSize" label="Punto" type="number" min="5" max="14" suffix="pt" hide-details
                  @update:model-value="(v: string) => patch({ fontSize: clampNum(v, 5, 14) })" @blur="commit()" />
                <v-switch :model-value="selected.zebra" label="Zebra satır" hide-details color="primary" @update:model-value="(v: boolean | null) => { patch({ zebra: !!v }); commit() }" />
              </div>
              <p class="ek-tpl-props__value">Sığmayan kalemler "+N kalem daha" satırıyla belirtilir; denetim uyarı verir.</p>
            </EkFormSection>

            <div class="ek-tpl-props__danger">
              <EkButton tone="secondary" icon="mdi-content-copy" @click="duplicate">Çoğalt</EkButton>
              <EkButton intent="delete" @click="removeSelected" />
            </div>
          </template>

          <template v-else>
            <EkFormSection :columns="1" title="Belge" class="ek-tpl-props__section">
              <v-select v-model="doc.kind" :items="DOC_KINDS" item-title="label" item-value="id" label="Belge türü" hide-details @update:model-value="commit()" />
              <v-select :model-value="doc.paper.preset" :items="PAPER_PRESETS" item-title="label" item-value="id" label="Kâğıt / etiket" hide-details
                @update:model-value="(v: string) => setPaper({ preset: v })">
                <template #item="{ props: ip, item }"><v-list-item v-bind="ip" role="option" :subtitle="item.raw.hint" /></template>
              </v-select>
              <div class="ek-tpl-props__grid2">
                <div class="ek-tpl-seg ek-tpl-seg--text" role="group" aria-label="Yön">
                  <button type="button" :aria-pressed="!doc.paper.landscape" @click="setPaper({ landscape: false })">Dikey</button>
                  <button type="button" :aria-pressed="doc.paper.landscape" @click="setPaper({ landscape: true })">Yatay</button>
                </div>
                <v-text-field :model-value="doc.paper.marginMm" label="Kenar boşluğu" type="number" min="0" max="25" suffix="mm" hide-details
                  @update:model-value="(v: string) => { doc.paper.marginMm = clampNum(v, 0, 25) }" @blur="commit()" />
              </div>
            </EkFormSection>

            <section class="ek-tpl-props__section ek-tpl-panel">
              <h3 class="ek-tpl-panel__title">Katmanlar <span>{{ doc.elements.length }}</span></h3>
              <EkEmptyState v-if="!doc.elements.length" variant="first-run" title="Tuval boş" message="Soldan bir alan ya da bileşen ekleyin; hazır şablondan başlamak için Şablonlar'a dönün." />
              <ol v-else class="ek-tpl-layers">
                <li v-for="el in [...doc.elements].reverse()" :key="el.id">
                  <button type="button" class="ek-tpl-layer" @click="select(el.id, true)">
                    <v-icon :icon="kindIcon(el.kind)" size="16" aria-hidden="true" />
                    <span>{{ elementName(el) }}</span>
                    <v-icon v-if="issueIds.has(el.id)" icon="mdi-alert-outline" size="16" class="ek-tpl-layer__warn" aria-label="Uyarı var" />
                  </button>
                </li>
              </ol>
            </section>

            <section ref="checksSection" class="ek-tpl-props__section ek-tpl-panel">
              <h3 class="ek-tpl-panel__title">Denetim</h3>
              <p v-if="!issues.length" class="ek-tpl-props__ok"><v-icon icon="mdi-check-circle-outline" size="18" aria-hidden="true" /> {{ sample.label }} ile sorun yok.</p>
              <ul v-else class="ek-tpl-issues">
                <li v-for="(i, n) in issues" :key="n" :class="`is-${i.level}`">
                  <v-icon :icon="i.level === 'error' ? 'mdi-alert-circle-outline' : 'mdi-alert-outline'" size="16" aria-hidden="true" />
                  <button v-if="i.elementId" type="button" class="ek-link ek-link--quiet" @click="select(i.elementId!, true)">{{ i.message }}</button>
                  <span v-else>{{ i.message }}</span>
                </li>
              </ul>
            </section>

            <section class="ek-tpl-props__section ek-tpl-panel">
              <h3 class="ek-tpl-panel__title">Kısayollar</h3>
              <dl class="ek-tpl-keys">
                <template v-for="k in SHORTCUTS" :key="k.label"><dt><EkKbd :keys="k.keys" /></dt><dd>{{ k.label }}</dd></template>
              </dl>
            </section>
          </template>
        </div>
      </aside>
    </div>

    <div class="ek-sr-only" aria-live="polite">{{ announcement }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { EkBadge, EkButton, EkEmptyState, EkFormSection, EkIconTile, EkKbd, EkPageTabs, EkTooltip } from '@entegrasyonik/ui/components'
import {
  DOC_KINDS, ELEMENT_KINDS, FIELDS, FIELD_GROUPS, ITEM_COLUMNS, NUDGE_LARGE_MM, NUDGE_MM, PAPER_PRESETS, SAMPLE_SETS,
  alignToPaper, clampToPaper, cloneDoc, createElement, docKindLabel, elementKindLabel, elementName, newId, paperLabel, paperSize,
  resolveField, round1, sampleData, searchFields, snap, validateTemplate,
  type AlignAction, type ElementKind, type ItemColumn, type SampleId, type TemplateDoc, type TemplateElement,
} from './templateModel'
import { TemplateHistory } from './templateHistory'
import TemplatePage from './TemplatePage'
import { geometryCss, safeId } from './renderTemplate'
import { PX_PER_MM, useTemplateCss } from './useTemplateCss'

const props = defineProps<{ template: TemplateDoc; savedAt?: string }>()
const emit = defineEmits<{ save: [doc: TemplateDoc]; close: []; preview: [doc: TemplateDoc]; dirty: [value: boolean] }>()

const GEOM_LABEL = { x: 'X', y: 'Y', w: 'Genişlik', h: 'Yükseklik' } as const
const ALIGNS: Array<{ id: AlignAction; icon: string; label: string }> = [
  { id: 'left', icon: 'mdi-align-horizontal-left', label: 'Sola hizala' },
  { id: 'hcenter', icon: 'mdi-align-horizontal-center', label: 'Yatay ortala' },
  { id: 'right', icon: 'mdi-align-horizontal-right', label: 'Sağa hizala' },
  { id: 'top', icon: 'mdi-align-vertical-top', label: 'Üste hizala' },
  { id: 'vmiddle', icon: 'mdi-align-vertical-center', label: 'Dikey ortala' },
  { id: 'bottom', icon: 'mdi-align-vertical-bottom', label: 'Alta hizala' },
]
const TEXT_ALIGNS = [
  { id: 'left', icon: 'mdi-format-align-left', label: 'Sola yasla' },
  { id: 'center', icon: 'mdi-format-align-center', label: 'Ortala' },
  { id: 'right', icon: 'mdi-format-align-right', label: 'Sağa yasla' },
] as const
const SHORTCUTS = [
  { keys: ['←', '→', '↑', '↓'], label: '1 mm taşı (Shift ile 5 mm)' },
  { keys: 'Del', label: 'Seçileni sil' },
  { keys: ['Ctrl', 'D'], label: 'Çoğalt' },
  { keys: ['Ctrl', 'Z'], label: 'Geri al' },
  { keys: ['Ctrl', 'Shift', 'Z'], label: 'Yinele' },
  { keys: ['Ctrl', 'S'], label: 'Kaydet' },
  { keys: ['+', '−'], label: 'Yakınlaştır / uzaklaştır' },
  { keys: ['Ctrl', '0'], label: 'Sığdır' },
  { keys: 'Esc', label: 'Seçimi kaldır' },
]

// Dar düzen kabın genişliğine göre (kenar menüsü açık/kapalı fark eder; pencere genişliği yanıltır).
const NARROW_BELOW = 880
const COMPACT_BELOW = 1120
const root = ref<HTMLElement | null>(null)
const rootW = ref(1280)
const narrow = computed(() => rootW.value < NARROW_BELOW)
const compact = computed(() => !narrow.value && rootW.value < COMPACT_BELOW)
const pane = ref<'add' | 'canvas' | 'props'>('canvas')
const leftTab = ref<'fields' | 'blocks'>('fields')
const fieldQuery = ref('')

// ─── Belge durumu + geçmiş ───
const doc = ref<TemplateDoc>(cloneDoc(props.template))
const saved = shallowRef<TemplateDoc>(cloneDoc(props.template))
let history = new TemplateHistory<TemplateDoc>(doc.value)
const canUndo = ref(false)
const canRedo = ref(false)
const historyTick = ref(0)
const selectedId = ref<string | null>(null)
const announcement = ref('')
const grid = ref(true)
const zoom = ref(1)
const sampleId = ref<SampleId>('normal')
const sample = computed(() => sampleData(sampleId.value))

const snapshot = () => cloneDoc(doc.value)
const syncHistory = () => { canUndo.value = history.canUndo; canRedo.value = history.canRedo; historyTick.value += 1 }
function commit() {
  if (history.commit(doc.value)) syncHistory()
}
const dirty = computed(() => { void historyTick.value; return history.isDirtyAgainst(saved.value) })
watch(dirty, (v) => emit('dirty', v), { immediate: true })

// Yalnız BAŞKA bir şablon açıldığında sıfırlanır; kaydetme sonrası gelen aynı şablon geçmişi silmez.
watch(() => props.template.id, () => {
  const t = props.template
  doc.value = cloneDoc(t)
  saved.value = cloneDoc(t)
  history = new TemplateHistory<TemplateDoc>(doc.value)
  selectedId.value = null
  syncHistory()
})

function undo() {
  const prev = history.undo()
  if (!prev) return
  doc.value = prev
  if (selectedId.value && !prev.elements.some((e) => e.id === selectedId.value)) selectedId.value = null
  syncHistory()
  say('Geri alındı')
}
function redo() {
  const next = history.redo()
  if (!next) return
  doc.value = next
  syncHistory()
  say('Yinelendi')
}
function save() {
  commit()
  const copy = snapshot()
  saved.value = copy
  historyTick.value += 1
  emit('save', copy)
}
function say(msg: string) { announcement.value = ''; nextTick(() => { announcement.value = msg }) }

// ─── Seçim ───
const selected = computed<TemplateElement | undefined>(() => doc.value.elements.find((e) => e.id === selectedId.value))
function select(id: string | null, focus = false) {
  selectedId.value = id
  if (id && narrow.value && focus) pane.value = 'canvas'
  if (id && focus) nextTick(() => (viewport.value?.querySelector(`[data-el="${safeId(id)}"]`) as HTMLElement | null)?.focus())
}
function patch(p: Partial<TemplateElement>) {
  const i = doc.value.elements.findIndex((e) => e.id === selectedId.value)
  if (i < 0) return
  doc.value.elements[i] = { ...doc.value.elements[i], ...p } as TemplateElement
}
function clampNum(v: string | number, min: number, max: number) {
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min
}
function setGeom(k: 'x' | 'y' | 'w' | 'h', v: string) {
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || !selected.value) return
  patch(clampToPaper({ ...selected.value, [k]: n }, doc.value.paper))
}
function alignSelected(a: AlignAction) {
  if (!selected.value) return
  patch(alignToPaper(selected.value, doc.value.paper, a))
  commit()
}
function setPaper(p: Partial<TemplateDoc['paper']>) {
  doc.value.paper = { ...doc.value.paper, ...p }
  doc.value.elements = doc.value.elements.map((e) => clampToPaper(e, doc.value.paper))
  commit()
  nextTick(fitZoom)
}
function toggleColumn(id: ItemColumn, on: boolean) {
  if (selected.value?.kind !== 'items') return
  const order = ITEM_COLUMNS.map((c) => c.id)
  const cols = new Set(selected.value.columns)
  if (on) cols.add(id); else cols.delete(id)
  patch({ columns: order.filter((c) => cols.has(c)) })
  commit()
}
const bindableFields = (kind: ElementKind) => (kind === 'field' ? FIELDS : FIELDS.filter((f) => f.code))
const kindIcon = (k: ElementKind) => ELEMENT_KINDS.find((e) => e.id === k)?.icon ?? 'mdi-shape-outline'

// ─── Ekleme ───
function insert(el: TemplateElement, label: string) {
  const placed = clampToPaper(el, doc.value.paper)
  doc.value.elements.push(placed)
  commit()
  select(placed.id, true)
  say(`${label} eklendi`)
}
/** Tıklayarak eklenen öğe: kenar boşluğundan başlayıp basamaklı yerleşir (üst üste binmesin). */
function nextSpot(): { x: number; y: number } {
  const m = doc.value.paper.marginMm
  const n = doc.value.elements.length % 12
  return { x: m + 2, y: m + 2 + n * 8 }
}
function addField(path: string, at = nextSpot()) {
  insert(createElement('field', at, { path }), FIELDS.find((f) => f.path === path)?.label ?? 'Alan')
}
function addBlock(kind: ElementKind, at = nextSpot()) {
  insert(createElement(kind, at), elementKindLabel(kind))
}
function duplicate() {
  if (!selected.value) return
  insert({ ...cloneDoc(selected.value), id: newId(), x: selected.value.x + 3, y: selected.value.y + 3 }, 'Kopya')
}
function removeSelected() {
  if (!selected.value) return
  const name = elementName(selected.value)
  doc.value.elements = doc.value.elements.filter((e) => e.id !== selectedId.value)
  selectedId.value = null
  commit()
  say(`${name} silindi`)
  viewport.value?.focus()
}

const fieldGroups = computed(() => {
  const found = searchFields(fieldQuery.value ?? '')
  return FIELD_GROUPS.map((group) => ({ group, fields: found.filter((f) => f.group === group) })).filter((g) => g.fields.length)
})

// ─── Tuval: render + geometri CSS ───
const key = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const viewport = ref<HTMLElement | null>(null)
const propsPanel = ref<HTMLElement | null>(null)
const checksSection = ref<HTMLElement | null>(null)
const size = computed(() => paperSize(doc.value.paper))
const issues = computed(() => validateTemplate(doc.value, sample.value))
const errors = computed(() => issues.value.filter((i) => i.level === 'error').length)
const warnings = computed(() => issues.value.length - errors.value)
const issueTone = computed(() => (errors.value ? 'is-error' : warnings.value ? 'is-warning' : 'is-ok'))
const issueIds = computed(() => new Set(issues.value.map((i) => i.elementId).filter(Boolean) as string[]))
const issueBoxes = computed(() => doc.value.elements.filter((e) => issueIds.value.has(e.id) && e.id !== selectedId.value).map((e) => safeId(e.id)))

const px = (mm: number) => Math.round(mm * PX_PER_MM * zoom.value * 100) / 100
const css = computed(() => {
  const f = `.ek-tpl-canvas__frame[data-frame="${key}"]`
  const { w, h } = size.value
  const m = doc.value.paper.marginMm
  const rules = [
    `${f}{width:${px(w)}px;height:${px(h)}px}`,
    `${f} .ek-tpl-page{transform:scale(${zoom.value});transform-origin:0 0}`,
    `${f} .ek-tpl-canvas__margin{left:${px(m)}px;top:${px(m)}px;width:${px(w - 2 * m)}px;height:${px(h - 2 * m)}px}`,
    `${f} .ek-tpl-canvas__grid{background-size:${px(5)}px ${px(5)}px}`,
    geometryCss(doc.value, key),
  ]
  for (const e of doc.value.elements) {
    if (!issueIds.value.has(e.id)) continue
    rules.push(`${f} [data-issue="${safeId(e.id)}"]{left:${px(e.x)}px;top:${px(e.y)}px;width:${px(e.w)}px;height:${px(Math.max(e.h, 0.8))}px}`)
  }
  const s = selected.value
  if (s) rules.push(`${f} .ek-tpl-canvas__sel{left:${px(s.x)}px;top:${px(s.y)}px;width:${px(s.w)}px;height:${px(Math.max(s.h, 0.8))}px}`)
  return rules.join('\n')
})
useTemplateCss(css)

// ─── Yakınlaştırma ───
const ZOOM_MIN = 0.25
const ZOOM_MAX = 4
function zoomBy(d: number) { zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((zoom.value + d) * 100) / 100)) }
function fitZoom() {
  const vp = viewport.value
  if (!vp) return
  const pad = 48
  const z = Math.min((vp.clientWidth - pad) / (size.value.w * PX_PER_MM), (vp.clientHeight - pad) / (size.value.h * PX_PER_MM))
  zoom.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.floor(z * 20) / 20))
}
let ro: ResizeObserver | undefined
let fitted = false
onMounted(() => {
  if (root.value) rootW.value = root.value.clientWidth
  nextTick(fitZoom)
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      if (root.value) rootW.value = root.value.clientWidth
      if (!fitted && viewport.value?.clientWidth) { fitted = true; fitZoom() }
    })
    if (root.value) ro.observe(root.value)
    if (viewport.value) ro.observe(viewport.value)
  }
})
watch(narrow, () => nextTick(fitZoom))
watch(pane, (p) => { if (p === 'canvas') nextTick(fitZoom) })

// ─── İşaretçi: taşıma / yeniden boyutlandırma ───
type Drag = { id: string; mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; moved: boolean; pointer: number }
let drag: Drag | null = null
const toMm = (pxDelta: number) => pxDelta / (PX_PER_MM * zoom.value)

function onPointerDown(ev: PointerEvent) {
  if (ev.button !== 0) return
  const target = ev.target as HTMLElement
  const handle = target.closest('[data-handle]')
  const elNode = target.closest('[data-el]') as HTMLElement | null
  const id = handle ? selectedId.value : elNode ? doc.value.elements.find((e) => safeId(e.id) === elNode.dataset.el)?.id ?? null : null
  if (!id) { select(null); return }
  selectedId.value = id
  const el = doc.value.elements.find((e) => e.id === id)!
  drag = { id, mode: handle ? 'resize' : 'move', sx: ev.clientX, sy: ev.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h, moved: false, pointer: ev.pointerId }
  ;(ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
  ev.preventDefault()
}
function onPointerMove(ev: PointerEvent) {
  if (!drag) return
  const dx = toMm(ev.clientX - drag.sx)
  const dy = toMm(ev.clientY - drag.sy)
  if (!drag.moved && Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) < 3) return
  drag.moved = true
  const s = (v: number) => (grid.value && !ev.altKey ? snap(v) : round1(v))
  const i = doc.value.elements.findIndex((e) => e.id === drag!.id)
  if (i < 0) return
  const cur = doc.value.elements[i]
  const next = drag.mode === 'move'
    ? { ...cur, x: s(drag.ox + dx), y: s(drag.oy + dy) }
    : { ...cur, w: Math.max(s(drag.ow + dx), 2), h: cur.kind === 'line' ? cur.h : Math.max(s(drag.oh + dy), 2) }
  doc.value.elements[i] = clampToPaper(next, doc.value.paper)
}
function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove)
  if (drag?.moved) commit()
  const id = drag?.id
  drag = null
  if (id) (viewport.value?.querySelector(`[data-el="${safeId(id)}"]`) as HTMLElement | null)?.focus({ preventScroll: true })
}
// Kısayollar belge düzeyinde dinlenir: odaklı öğe silinince/geri alınınca odak <body>'ye düşer; kısayollar yine çalışmalı.
// Yalnız odak düzenleyicideyse ya da hiçbir yerde değilse (body) işlenir; diyalog/menü açıkken veya gizliyken (önizleme) yok sayılır.
function onDocKeydown(ev: KeyboardEvent) {
  const t = ev.target as Node | null
  const inside = !!(t && root.value?.contains(t))
  const loose = t === document.body || t === document.documentElement
  if (!inside && !loose) return
  if (!root.value || root.value.offsetParent === null) return
  if (loose && document.querySelector('.v-overlay--active')) return
  onKeydown(ev)
}
onMounted(() => document.addEventListener('keydown', onDocKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocKeydown)
  window.removeEventListener('pointermove', onPointerMove)
  ro?.disconnect()
})

function onFocusIn(ev: FocusEvent) {
  const node = (ev.target as HTMLElement).closest?.('[data-el]') as HTMLElement | null
  if (!node) return
  const el = doc.value.elements.find((e) => safeId(e.id) === node.dataset.el)
  if (el && el.id !== selectedId.value) { selectedId.value = el.id; say(`${elementName(el)} seçildi`) }
}

// ─── Paletten sürükle-bırak ───
const DND_TYPE = 'application/x-ek-template'
function onPaletteDrag(ev: DragEvent, kind: ElementKind, path?: string) {
  ev.dataTransfer?.setData(DND_TYPE, JSON.stringify({ kind, path }))
  ev.dataTransfer?.setData('text/plain', path ?? kind)
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy'
}
function onDragOver(ev: DragEvent) { if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy' }
function onDrop(ev: DragEvent) {
  const raw = ev.dataTransfer?.getData(DND_TYPE)
  if (!raw) return
  let data: { kind: ElementKind; path?: string }
  try { data = JSON.parse(raw) } catch { return }
  const page = viewport.value?.querySelector('.ek-tpl-canvas__frame') as HTMLElement | null
  if (!page) return
  const r = page.getBoundingClientRect()
  const at = { x: snap(toMm(ev.clientX - r.left)), y: snap(toMm(ev.clientY - r.top)) }
  if (data.kind === 'field') addField(data.path ?? 'order.number', at)
  else addBlock(data.kind, at)
}

// ─── Klavye ───
function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}
function onKeydown(ev: KeyboardEvent) {
  const mod = ev.ctrlKey || ev.metaKey
  const k = ev.key.toLowerCase()
  if (mod && k === 's') { ev.preventDefault(); save(); return }
  if (isTyping(ev.target)) return
  if (mod && k === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); return }
  if (mod && (k === 'y' || (k === 'z' && ev.shiftKey))) { ev.preventDefault(); redo(); return }
  if (mod && k === '0') { ev.preventDefault(); fitZoom(); return }
  if (!mod && (ev.key === '+' || ev.key === '=')) { ev.preventDefault(); zoomBy(0.25); return }
  if (!mod && (ev.key === '-' || ev.key === '_')) { ev.preventDefault(); zoomBy(-0.25); return }
  if (!selected.value) return
  if (mod && k === 'd') { ev.preventDefault(); duplicate(); return }
  if (ev.key === 'Escape') { ev.preventDefault(); select(null); viewport.value?.focus(); return }
  if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); removeSelected(); return }
  const step = ev.shiftKey ? NUDGE_LARGE_MM : NUDGE_MM
  const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const d = delta[ev.key]
  if (d) {
    ev.preventDefault()
    patch(clampToPaper({ ...selected.value, x: round1(selected.value.x + d[0]), y: round1(selected.value.y + d[1]) }, doc.value.paper))
    commit()
  }
}

function showChecks() {
  select(null)
  if (narrow.value) pane.value = 'props'
  nextTick(() => checksSection.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }))
}

defineExpose({ save, dirty })
</script>

<style scoped>
.ek-tpl-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: calc(100vh - 220px);
  min-height: 560px;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  overflow: hidden;
}
.ek-tpl-editor.is-narrow { height: auto; min-height: 0; }

/* Üst çubuk */
.ek-tpl-editor__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  padding: var(--ek-space-2) var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}
.ek-tpl-editor__title { display: flex; align-items: center; gap: var(--ek-space-2); flex: 1 1 280px; min-width: 0; }
.ek-tpl-editor__name { flex: 0 1 300px; min-width: 160px; }
.ek-tpl-editor__state { display: inline-flex; align-items: center; gap: var(--ek-space-1); font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); white-space: nowrap; }
.ek-tpl-editor__state.is-dirty { color: var(--ek-color-warning-emphasis); }
.ek-tpl-editor__tools { display: flex; align-items: center; gap: var(--ek-space-1); }
.ek-tpl-editor__sep { width: 1px; height: 20px; background: var(--ek-color-border-subtle); margin: 0 var(--ek-space-1); }
.ek-tpl-editor__zoom {
  min-width: 52px;
  height: var(--ek-control-h-sm);
  border-radius: var(--ek-radius-control);
  font-size: var(--ek-font-size-xs);
  font-variant-numeric: tabular-nums;
  color: var(--ek-color-content-default);
}
.ek-tpl-editor__zoom:hover { background: var(--ek-color-surface-muted); }
.ek-tpl-editor__zoom:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.ek-tpl-editor__actions { display: flex; gap: var(--ek-space-2); margin-left: auto; }
.ek-tpl-editor__panes { padding: 0 var(--ek-space-3); }
.ek-tpl-editor :deep(.ek-page-tabs) { flex: none; }
.is-narrow .ek-tpl-editor__title { flex-wrap: wrap; flex-basis: 100%; }
.is-narrow .ek-tpl-editor__name { flex: 1 1 100%; max-width: none; }
.is-narrow .ek-tpl-editor__actions { margin-left: 0; flex: 1 1 auto; justify-content: flex-end; }

/* Gövde: sol | orta | sağ */
.ek-tpl-editor__body {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr) 304px;
  flex: 1 1 auto;
  min-height: 0;
}
.is-compact .ek-tpl-editor__body { grid-template-columns: 236px minmax(0, 1fr) 260px; }
.is-narrow .ek-tpl-editor__body { display: block; }
.ek-tpl-editor__left,
.ek-tpl-editor__right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ek-color-surface);
}
.ek-tpl-editor__left { border-right: 1px solid var(--ek-color-border-subtle); padding-top: var(--ek-space-2); }
.ek-tpl-editor__left > :deep(.ek-page-tabs) { margin: 0 var(--ek-space-3); }
.ek-tpl-editor__right { border-left: 1px solid var(--ek-color-border-subtle); }
.is-narrow .ek-tpl-editor__left,
.is-narrow .ek-tpl-editor__right { border: 0; }
.ek-tpl-editor__scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: var(--ek-space-3); }
.ek-tpl-editor__search { margin-bottom: var(--ek-space-2); }
.ek-tpl-editor__hint { margin: 0 0 var(--ek-space-3); font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }
.ek-tpl-editor__group + .ek-tpl-editor__group { margin-top: var(--ek-space-4); }
.ek-tpl-editor__group-title {
  margin: 0 0 var(--ek-space-1);
  font-size: var(--ek-font-size-2xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}
.ek-tpl-editor__list, .ek-tpl-editor__blocks, .ek-tpl-layers, .ek-tpl-issues { list-style: none; margin: 0; padding: 0; }

.ek-tpl-palette-item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  padding: var(--ek-space-1) var(--ek-space-2);
  border-radius: var(--ek-radius-sm);
  text-align: left;
  cursor: grab;
  color: var(--ek-color-content-default);
  transition: var(--ek-transition-colors);
}
.ek-tpl-palette-item:hover { background: var(--ek-color-surface-muted); }
.ek-tpl-palette-item:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.ek-tpl-palette-item__icon { color: var(--ek-color-content-subtle); }
.ek-tpl-palette-item__text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.ek-tpl-palette-item__label { font-size: var(--ek-font-size-sm); line-height: var(--ek-line-height-tight); }
.ek-tpl-palette-item__sample {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ek-tpl-editor__blocks { display: grid; gap: var(--ek-space-2); }
.ek-tpl-block {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  text-align: left;
  cursor: grab;
  transition: var(--ek-transition-colors);
}
.ek-tpl-block:hover { border-color: var(--ek-color-border-strong); background: var(--ek-color-surface-muted); }
.ek-tpl-block:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.ek-tpl-block__text { display: flex; flex-direction: column; min-width: 0; font-size: var(--ek-font-size-sm); color: var(--ek-color-content-strong); }
.ek-tpl-block__text span { font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }

/* Tuval */
.ek-tpl-editor__center { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--ek-color-surface-sunken); }
.is-narrow .ek-tpl-editor__center { min-height: 480px; }
.ek-tpl-canvas {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  padding: var(--ek-space-6);
  outline: none;
}
.is-narrow .ek-tpl-canvas { height: 420px; padding: var(--ek-space-4); }
.ek-tpl-canvas:focus-visible { box-shadow: inset var(--ek-focus-ring); }
.ek-tpl-canvas__frame {
  position: relative;
  flex: none;
  margin: auto;
  box-shadow: var(--ek-shadow-md);
  outline: 1px solid var(--ek-color-border-subtle);
  touch-action: none;
}
.ek-tpl-canvas__page { position: absolute; inset: 0; }
.ek-tpl-canvas__page :deep(.ek-tpl-el) { cursor: move; }
.ek-tpl-canvas__page :deep(.ek-tpl-el:hover) { outline: 1px dashed color-mix(in srgb, var(--ek-color-action) 55%, transparent); outline-offset: 0; }
.ek-tpl-canvas__page :deep(.ek-tpl-el:focus-visible) { outline: 2px solid var(--ek-color-action); outline-offset: 1px; }
.ek-tpl-canvas__margin {
  position: absolute;
  pointer-events: none;
  border: 1px dashed color-mix(in srgb, var(--ek-color-action) 40%, transparent);
}
.ek-tpl-canvas__grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--ek-color-action) 9%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--ek-color-action) 9%, transparent) 1px, transparent 1px);
}
.ek-tpl-canvas__issue {
  position: absolute;
  pointer-events: none;
  outline: 1px dashed var(--ek-color-warning);
}
.ek-tpl-canvas__sel {
  position: absolute;
  pointer-events: none;
  outline: 2px solid var(--ek-color-action);
}
.ek-tpl-canvas__size {
  position: absolute;
  left: 0;
  top: calc(100% + 4px);
  padding: 0 var(--ek-space-1);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  font-size: var(--ek-font-size-2xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ek-tpl-canvas__handle {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--ek-color-action);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface);
  cursor: nwse-resize;
  pointer-events: auto;
}

.ek-tpl-editor__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-4);
  padding: var(--ek-space-2) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  font-variant-numeric: tabular-nums;
}
.ek-tpl-editor__pos { color: var(--ek-color-content-default); }
.ek-tpl-editor__sample { display: inline-flex; align-items: center; gap: var(--ek-space-2); }
.ek-tpl-editor__sample select {
  height: var(--ek-control-h-sm);
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-input);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-font-size-xs);
}
.ek-tpl-editor__sample select:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.ek-tpl-editor__issues {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  height: var(--ek-control-h-sm);
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
}
.ek-tpl-editor__issues:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.ek-tpl-editor__issues.is-ok { background: var(--ek-color-success-subtle); color: var(--ek-color-success-emphasis); }
.ek-tpl-editor__issues.is-warning { background: var(--ek-color-warning-subtle); color: var(--ek-color-warning-emphasis); }
.ek-tpl-editor__issues.is-error { background: var(--ek-color-error-subtle); color: var(--ek-color-error-emphasis); }

/* Özellikler */
.ek-tpl-props__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding-bottom: var(--ek-space-3);
  margin-bottom: var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}
.ek-tpl-props__name { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; font-size: var(--ek-font-size-sm); color: var(--ek-color-content-strong); }
.ek-tpl-props__name span { font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ek-tpl-panel { margin-top: var(--ek-space-6); padding-top: var(--ek-space-5); border-top: 1px solid var(--ek-color-border-subtle); }
.ek-tpl-panel__title {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-3);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
  color: var(--ek-color-content-strong);
}
.ek-tpl-panel__title span { font-size: var(--ek-font-size-xs); font-weight: var(--ek-font-weight-regular); color: var(--ek-color-content-muted); font-variant-numeric: tabular-nums; }
.ek-tpl-props__grid4 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ek-space-2); }
.ek-tpl-props__grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ek-space-2); align-items: center; }
.ek-tpl-props__align { display: flex; flex-wrap: wrap; gap: var(--ek-space-1); }
.ek-tpl-props__value { margin: 0; font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); overflow-wrap: anywhere; }
.ek-tpl-props__value strong { color: var(--ek-color-content-default); font-weight: var(--ek-font-weight-medium); }
.ek-tpl-props__cols { border: 0; margin: 0; padding: 0; }
.ek-tpl-props__cols legend { font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); margin-bottom: var(--ek-space-1); }
.ek-tpl-props__danger {
  display: flex;
  justify-content: space-between;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-5);
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}
.ek-tpl-props__ok { display: flex; align-items: center; gap: var(--ek-space-2); margin: 0; font-size: var(--ek-font-size-sm); color: var(--ek-color-success-emphasis); }

.ek-tpl-seg {
  display: inline-flex;
  height: var(--ek-control-h-field);
  padding: 2px;
  border: 1px solid var(--ek-color-border-input);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}
.ek-tpl-seg button {
  flex: 1 1 0;
  min-width: 32px;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-sm);
  transition: var(--ek-transition-colors);
}
.ek-tpl-seg button[aria-pressed='true'] { background: var(--ek-color-surface); color: var(--ek-color-content-strong); box-shadow: var(--ek-shadow-sm); }
.ek-tpl-seg button:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.ek-tpl-seg--text { width: 100%; }

.ek-tpl-layer {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  padding: var(--ek-space-1) var(--ek-space-2);
  border-radius: var(--ek-radius-sm);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
  text-align: left;
}
.ek-tpl-layer span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ek-tpl-layer:hover { background: var(--ek-color-surface-muted); }
.ek-tpl-layer:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.ek-tpl-layer__warn { color: var(--ek-color-warning-emphasis); }
.ek-tpl-issues li { display: flex; gap: var(--ek-space-2); align-items: flex-start; font-size: var(--ek-font-size-sm); }
.ek-tpl-issues li + li { margin-top: var(--ek-space-2); }
.ek-tpl-issues .is-error .v-icon { color: var(--ek-color-error-emphasis); }
.ek-tpl-issues .is-warning .v-icon { color: var(--ek-color-warning-emphasis); }
.ek-tpl-issues button { text-align: left; }
.ek-tpl-keys { display: grid; grid-template-columns: auto 1fr; gap: var(--ek-space-2) var(--ek-space-3); margin: 0; align-items: center; font-size: var(--ek-font-size-xs); color: var(--ek-color-content-muted); }
.ek-tpl-keys dd { margin: 0; }


@media (prefers-reduced-motion: reduce) {
  .ek-tpl-palette-item, .ek-tpl-block, .ek-tpl-seg button { transition: none; }
}
</style>
