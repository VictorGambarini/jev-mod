import { afterEach, expect, test } from 'vitest'
import { defaultTaxRate } from '../../src/billing/tax/default-rate'
import { taxRateFor } from '../../src/billing/tax/region-rates'

afterEach(() => { delete process.env.TAX_RATE })

test('a region with its own rate ignores TAX_RATE', () => {
  process.env.TAX_RATE = '0.5'
  expect(taxRateFor('NZ')).toBe(0.15)
})

test('an unknown region falls back to TAX_RATE', () => {
  process.env.TAX_RATE = '0.07'
  expect(taxRateFor('XX')).toBe(0.07)
})

test('a rate of 100% or more is refused', () => {
  process.env.TAX_RATE = '1.2'
  expect(() => defaultTaxRate()).toThrow()
})
