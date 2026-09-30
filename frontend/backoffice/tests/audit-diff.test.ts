import { describe, expect, it } from 'vitest'
import { auditChanges } from '../src/utils/audit'

describe('denetim önce/sonra', () => {
  it('b_/a_ çiftlerini alan başına birleştirir; diğer meta alanlarını atlar', () => {
    expect(auditChanges({ op: 'X', reason: 'r', b_status: 'PASSIVE', a_status: 'ACTIVE', a_count: 3 })).toEqual([
      { field: 'status', before: 'PASSIVE', after: 'ACTIVE' },
      { field: 'count', after: 3 },
    ])
    expect(auditChanges(undefined)).toEqual([])
  })
})
