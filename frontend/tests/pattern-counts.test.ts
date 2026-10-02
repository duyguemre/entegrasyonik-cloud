import { describe, expect, it } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { countFileContent, hasPageHeader, screenHasPageHeader, buildPageHeaderMissing } = require('../scripts/pattern-counts.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('node:fs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const os = require('node:os')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('node:path')

/** ADR-0015 Karar 6.4 — desen mandalı sayım mantığı birim testleri. */
describe('pattern-counts.js countFileContent', () => {
  it('<v-data-table/<v-data-table-server/<v-table hepsini rawDataTable olarak sayar', () => {
    const content = '<v-data-table /><v-data-table-server /><v-table></v-table>'
    expect(countFileContent(content).rawDataTable).toBe(3)
  })

  it('<v-dialog sayısını rawDialog olarak sayar', () => {
    const content = '<v-dialog v-model="x"><v-card /></v-dialog>'
    expect(countFileContent(content).rawDialog).toBe(1)
  })

  it('<v-chip sayısını rawChip olarak sayar', () => {
    const content = '<v-chip color="success">Aktif</v-chip><v-chip>Pasif</v-chip>'
    expect(countFileContent(content).rawChip).toBe(2)
  })

  it('toLocaleString/toLocaleDateString/Intl.NumberFormat/toFixed( hepsini rawFormat olarak sayar', () => {
    const content = `
      const a = x.toLocaleString('tr-TR')
      const b = x.toLocaleDateString('tr-TR')
      const c = new Intl.NumberFormat('tr-TR').format(x)
      const d = x.toFixed(2)
    `
    expect(countFileContent(content).rawFormat).toBe(4)
  })

  it('<v-progress-circular sayısını rawSpinner olarak sayar', () => {
    expect(countFileContent('<v-progress-circular indeterminate />').rawSpinner).toBe(1)
  })

  it('icon prop\'lu ama aria-label\'sız <v-btn i sayar; prepend-icon/append-icon SAYMAZ', () => {
    const content = `
      <v-btn icon="mdi-delete" />
      <v-btn icon="mdi-eye" aria-label="Detay" />
      <v-btn prepend-icon="mdi-plus">Ekle</v-btn>
    `
    expect(countFileContent(content).iconBtnNoLabel).toBe(1)
  })

  it('"ek-pattern-exception" yorumu olan SATIRDAKİ eşleşmeyi saymaz, ama patternExceptions\'a yazar', () => {
    const content = `
      <!-- ek-pattern-exception: EkDetailSheet — spec kancası nedeniyle geçici -->
      <v-dialog v-model="x" />
      <v-dialog v-model="y" />
    `
    const counts = countFileContent(content)
    expect(counts.rawDialog).toBe(2)
    expect(counts.patternExceptions).toBe(1)
  })

  it('total, tüm rawX kategorilerinin toplamıdır (patternExceptions HARİÇ)', () => {
    const content = '<v-dialog /><v-chip>X</v-chip>'
    const counts = countFileContent(content)
    expect(counts.total).toBe(counts.rawDataTable + counts.rawDialog + counts.rawChip + counts.rawFormat + counts.rawSpinner + counts.iconBtnNoLabel)
  })

  it('temiz bir dosya (Ek* şablonu gibi) tüm kategorilerde 0 döner', () => {
    const counts = countFileContent('<template><span>merhaba</span></template>')
    expect(counts.total).toBe(0)
    expect(counts.iconBtnNoLabel).toBe(0)
  })
})

describe('hasPageHeader (DS-v2 liste standardı)', () => {
  it('EkPageHeader içeren ekran başlıklıdır', () => {
    expect(hasPageHeader('<template><EkPageHeader title="X" /></template>')).toBe(true)
  })
  it('başlıklı EkListScreen başlıklıdır (öznitelik değerinde => olsa da)', () => {
    const tpl = '<template>\n  <EkListScreen\n    :row-class="(r) => r.x"\n    title="Siparişler"\n    label="t"\n  >\n  </EkListScreen>\n</template>'
    expect(hasPageHeader(tpl)).toBe(true)
  })
  it('başlıksız EkListScreen (sekmeli sayfa içi) başlık sayılmaz', () => {
    const tpl = '<template>\n  <EkListScreen\n    label="t"\n  >\n    <template #cell-x="{ row }"><span title="ipucu">x</span></template>\n  </EkListScreen>\n</template>'
    expect(hasPageHeader(tpl)).toBe(false)
  })
})

describe('hasPageHeader — EkPageBar (fe-r4d D4)', () => {
  it('doğrudan EkPageBar çizen ekran başlıklıdır', () => {
    expect(hasPageHeader('<template><EkPageBar section="Katalog" title="Kategoriler" /></template>')).toBe(true)
  })
  it('yalnız yorumda/metinde "EkPageBarX" geçmesi başlık sayılmaz', () => {
    expect(hasPageHeader('<template><EkPageBarX /></template>')).toBe(false)
  })
})

describe('screenHasPageHeader — yönetici bileşene devir (fe-r4d D4)', () => {
  function fixture(files: Record<string, string>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'))
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
      fs.writeFileSync(path.join(root, rel), body)
    }
    return root
  }
  it('başlığı içe aktardığı bileşende (EkPageBar) çizen ekran başlıklı sayılır; başlıksız ekran eksik kalır', () => {
    const root = fixture({
      'src/views/secure/definitions/CatView.vue': "<template><CategoryManager /></template>\n<script setup>import CategoryManager from '@/components/categories/CategoryManager.vue'</script>",
      'src/components/categories/CategoryManager.vue': '<template><EkPageBar title="Kategoriler" /></template>',
      'src/views/secure/Bare.vue': "<template><Row /></template>\n<script setup>import Row from './Row.vue'</script>",
      'src/views/secure/Row.vue': '<template><div /></template>',
    })
    expect(screenHasPageHeader(path.join(root, 'src/views/secure/definitions/CatView.vue'), root)).toBe(true)
    expect(buildPageHeaderMissing(root)).toEqual({
      'src/views/secure/Bare.vue': 1,
      'src/views/secure/Row.vue': 1,
      'src/views/secure/definitions/CatView.vue': 0,
    })
  })
  it('sayfa şablonlarının kendisi (src/components/page) devir sayılmaz — başlıksız EkListScreen başlıksız kalır', () => {
    const root = fixture({
      'src/views/secure/Tab.vue': "<template><EkListScreen\n  label=\"t\"\n>\n</EkListScreen></template>\n<script setup>import EkListScreen from '@/components/page/templates/EkListScreen.vue'</script>",
      'src/components/page/templates/EkListScreen.vue': '<template><EkPageBar v-if="title" /></template>',
    })
    expect(screenHasPageHeader(path.join(root, 'src/views/secure/Tab.vue'), root)).toBe(false)
  })
  it('döngülü içe aktarımda takılmaz', () => {
    const root = fixture({
      'src/views/secure/A.vue': "<script setup>import B from './B.vue'</script>",
      'src/views/secure/B.vue': "<script setup>import A from './A.vue'</script>",
    })
    expect(screenHasPageHeader(path.join(root, 'src/views/secure/A.vue'), root)).toBe(false)
  })
})
