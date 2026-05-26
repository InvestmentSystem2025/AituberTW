/**
 * @jest-environment node
 */

import { getNewebPayConfig } from '@/lib/newebpay'
import { getMpgConfig } from '@/lib/newebpay/mpgClient'
import { getPeriodicConfig } from '@/lib/newebpay/periodicClient'

const ORIGINAL_ENV = process.env

describe('NewebPay credential selection', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NEWEBPAY_ENV: 'test',
      TEST_NEWEBPAY_MERCHANT_ID: 'test-merchant',
      TEST_NEWEBPAY_HASH_KEY: 'test-hash-key',
      TEST_NEWEBPAY_HASH_IV: 'test-hash-iv',
      NEWEBPAY_MERCHANT_ID: 'prod-merchant',
      NEWEBPAY_HASH_KEY: 'prod-hash-key',
      NEWEBPAY_HASH_IV: 'prod-hash-iv',
      NEWEBPAY_MPG_MERCHANT_ID: 'mpg-merchant',
      NEWEBPAY_MPG_HASH_KEY: 'mpg-hash-key',
      NEWEBPAY_MPG_HASH_IV: 'mpg-hash-iv',
      NEWEBPAY_PERIOD_MERCHANT_ID: 'period-merchant',
      NEWEBPAY_PERIOD_HASH_KEY: 'period-hash-key',
      NEWEBPAY_PERIOD_HASH_IV: 'period-hash-iv',
    }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('uses TEST_NEWEBPAY credentials for every client when NEWEBPAY_ENV is test', () => {
    expect(getNewebPayConfig()).toMatchObject({
      merchantId: 'test-merchant',
      hashKey: 'test-hash-key',
      hashIV: 'test-hash-iv',
      env: 'test',
    })
    expect(getMpgConfig()).toMatchObject({
      merchantId: 'test-merchant',
      hashKey: 'test-hash-key',
      hashIV: 'test-hash-iv',
      env: 'test',
    })
    expect(getPeriodicConfig()).toMatchObject({
      merchantId: 'test-merchant',
      hashKey: 'test-hash-key',
      hashIV: 'test-hash-iv',
      env: 'test',
    })
  })

  it('uses service-specific credentials first when NEWEBPAY_ENV is production', () => {
    process.env.NEWEBPAY_ENV = 'production'

    expect(getNewebPayConfig()).toMatchObject({
      merchantId: 'prod-merchant',
      hashKey: 'prod-hash-key',
      hashIV: 'prod-hash-iv',
      env: 'production',
    })
    expect(getMpgConfig()).toMatchObject({
      merchantId: 'mpg-merchant',
      hashKey: 'mpg-hash-key',
      hashIV: 'mpg-hash-iv',
      env: 'production',
    })
    expect(getPeriodicConfig()).toMatchObject({
      merchantId: 'period-merchant',
      hashKey: 'period-hash-key',
      hashIV: 'period-hash-iv',
      env: 'production',
    })
  })

  it('falls back to base production credentials when service-specific credentials are blank', () => {
    process.env.NEWEBPAY_ENV = 'production'
    process.env.NEWEBPAY_MPG_MERCHANT_ID = ''
    process.env.NEWEBPAY_MPG_HASH_KEY = ''
    process.env.NEWEBPAY_MPG_HASH_IV = ''
    process.env.NEWEBPAY_PERIOD_MERCHANT_ID = ''
    process.env.NEWEBPAY_PERIOD_HASH_KEY = ''
    process.env.NEWEBPAY_PERIOD_HASH_IV = ''

    expect(getMpgConfig()).toMatchObject({
      merchantId: 'prod-merchant',
      hashKey: 'prod-hash-key',
      hashIV: 'prod-hash-iv',
      env: 'production',
    })
    expect(getPeriodicConfig()).toMatchObject({
      merchantId: 'prod-merchant',
      hashKey: 'prod-hash-key',
      hashIV: 'prod-hash-iv',
      env: 'production',
    })
  })
})
