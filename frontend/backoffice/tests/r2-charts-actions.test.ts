// BO-R2 (K59): ECharts teması (BO2-60) ve eylem sözlüğü (BO2-50) — saf mantık.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appSemanticColorsDark, appSemanticColorsLight } from '@entegrasyonik/ui/tokens'
import { ACTION_ICONS } from '@entegrasyonik/ui/icons'
import { CATEGORICAL, CHART_THEME_NAME, buildChartTheme, toneColor, withAlpha } from '../src/components/charts/chartTheme'
import { buildOption, describeSeries } from '../src/components/charts/options'
import { BO_ACTIONS, boActionLabel } from '../src/components/r2/actions'

const CHARTS = join(__dirname, '..', 'src', 'components', 'charts')

describe('BO2-60 ECharts teması token\'dan türer', () => {
  it('açık ve koyu tema ayrı adla, renkler yalnız token değerleri', () => {
    expect(CHART_THEME_NAME.light).not.toBe(CHART_THEME_NAME.dark)
    for (const [mode, tokens] of [['light', appSemanticColorsLight], ['dark', appSemanticColorsDark]] as const) {
      const t = buildChartTheme(mode)
      const tokenValues = new Set(Object.values(tokens))
      for (const c of t.color) expect(tokenValues.has(c), `${mode} ${c}`).toBe(true)
      expect(t.tooltip.backgroundColor).toBe(tokens.surface)
      expect(t.valueAxis.splitLine.lineStyle.color).toBe(tokens['border-subtle'])
      expect(t.categoryAxis.axisLabel.color).toBe(tokens['content-muted'])
      expect(t.animationDuration).toBeLessThanOrEqual(300)
      expect(t.animationEasing).not.toMatch(/elastic|bounce|back/i)
    }
    expect(CATEGORICAL[0]).toBe('action')
    expect(toneColor('error', 'dark')).toBe(appSemanticColorsDark.error)
  })

  it('grafik kaynaklarında literal renk yok (yalnız token → withAlpha)', () => {
    for (const f of readdirSync(CHARTS)) {
      const src = readFileSync(join(CHARTS, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
      expect(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?!\w)/.test(src.replace(/'#'/g, '')), f).toBe(false)
    }
    expect(withAlpha('#2E55D4', 0.1)).toBe('rgba(46, 85, 212, 0.1)')
  })

  it('seçenek kurucu: yığılmış sütun, eşik çizgisi, durum tonu ve sparkline', () => {
    const o = buildOption({
      kind: 'stacked-bar',
      mode: 'light',
      animate: false,
      categories: ['10:00', '11:00'],
      series: [{ name: 'Başarılı', data: [5, 6], tone: 'action' }, { name: 'Başarısız', data: [1, 0], tone: 'error' }],
      threshold: { value: 4, label: 'eşik' },
    }) as { series: Array<{ type: string; stack?: string; itemStyle: { color: string }; markLine?: unknown }>; animation: boolean }
    expect(o.animation).toBe(false)
    expect(o.series.map((s) => s.type)).toEqual(['bar', 'bar'])
    expect(o.series.every((s) => s.stack === 'total')).toBe(true)
    expect(o.series[1].itemStyle.color).toBe(appSemanticColorsLight.error)
    expect(o.series[0].markLine).toBeTruthy()

    const sp = buildOption({ kind: 'sparkline', mode: 'dark', animate: true, series: [{ name: 'x', data: [1, 2, 3], tone: 'warning' }] }) as { xAxis: { show: boolean }; tooltip: { show: boolean } }
    expect(sp.xAxis.show).toBe(false)
    expect(sp.tooltip.show).toBe(false)

    const dn = buildOption({ kind: 'donut', mode: 'light', animate: true, categories: ['Aktif', 'Başarısız'], categoryTones: ['success', 'error'], series: [{ name: 'M', data: [10, 1] }] }) as {
      series: Array<{ data: Array<{ itemStyle: { color: string } }> }>
    }
    expect(dn.series[0].data.map((d) => d.itemStyle.color)).toEqual([appSemanticColorsLight.success, appSemanticColorsLight.error])
  })

  it('erişilebilir özet: toplam, en yüksek (zamanıyla) ve son değer', () => {
    expect(describeSeries([{ name: 'İstek', data: [3, 9, 4] }], ['10:00', '11:00', '12:00'])).toBe('İstek: toplam 16, en yüksek 9 (11:00), son 4')
    expect(describeSeries([{ name: 'Boş', data: [] }], undefined)).toBe('Boş: veri yok')
  })
})

describe('BO2-50 eylem sözlüğü tek kaynak', () => {
  it('her eylemin ikonu, etiketi ve varyantı var; ortak kayıt defteriyle aynı glif', () => {
    for (const [k, d] of Object.entries(BO_ACTIONS)) {
      expect(d.icon, k).toMatch(/^mdi-/)
      expect(d.label.length, k).toBeGreaterThan(1)
      expect(['primary', 'secondary', 'ghost', 'danger-quiet']).toContain(d.tone)
    }
    expect(BO_ACTIONS.refresh.icon).toBe(ACTION_ICONS.refresh.icon)
    expect(BO_ACTIONS.edit.icon).toBe(ACTION_ICONS.edit.icon)
    expect(BO_ACTIONS.delete.icon).toBe(ACTION_ICONS.delete.icon)
    expect(BO_ACTIONS.export.icon).toBe(ACTION_ICONS.exportFile.icon)
  })

  it('yıkıcı eylemler sakin yıkıcı varyantta ve işaretli', () => {
    const danger = Object.entries(BO_ACTIONS).filter(([, d]) => 'danger' in d && d.danger).map(([k]) => k)
    expect(danger.sort()).toEqual(['cancel', 'delete', 'discard', 'flush', 'reset'])
    for (const k of danger) expect(BO_ACTIONS[k as keyof typeof BO_ACTIONS].tone).toBe('danger-quiet')
  })

  it('erişilebilir ad nesneyle kurulur', () => {
    expect(boActionLabel('edit', 'Duyuruyu')).toBe('Duyuruyu düzenle')
    expect(boActionLabel('refresh')).toBe('Yenile')
    // bo-wdg: "Ayrıntı" isimdir → nesneyle doğal fiil öbeği.
    expect(boActionLabel('detail')).toBe('Ayrıntı')
    expect(boActionLabel('detail', 'Poyraz Outdoor aboneliğinin')).toBe('Poyraz Outdoor aboneliğinin ayrıntılarını aç')
  })
})
