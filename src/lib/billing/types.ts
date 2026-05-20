export const BILLING_BLOCKED_SUBSCRIPTION_STATUSES = new Set([
  'pending',
  'failed',
  'suspended_by_user',
  'suspended_by_admin',
  'admin_revoked',
  'canceled',
  'expired',
])

export const SUBSCRIPTION_USABLE_WITH_TIME_AND_TOKENS = new Set([
  'active',
  'past_due',
  'payment_failed',
  'cancel_at_period_end',
  'card_update_required',
  // Legacy/migrated compatibility only. New admin grants must use
  // admin_billing_entitlements, never subscriptions.status=manual_granted.
  'manual_granted',
])

export type BillingSource = 'free_quota' | 'subscription' | 'purchased_credit'

export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'failed'
  | 'past_due'
  | 'payment_failed'
  | 'suspended_by_user'
  | 'suspended_by_admin'
  | 'admin_revoked'
  | 'manual_granted'
  | 'cancel_at_period_end'
  | 'canceled'
  | 'card_update_required'
  | 'expired'

export const computeUsableDaysRemaining = (
  currentPeriodEnd: string | null | undefined,
  adminEntitlementEnd?: string | null
): number => {
  const now = Date.now()
  const candidates = [currentPeriodEnd, adminEntitlementEnd]
    .filter((value): value is string => !!value)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))

  if (candidates.length === 0) return 0
  const entitlementEnd = Math.max(...candidates)
  return Math.max(0, Math.ceil((entitlementEnd - now) / (24 * 60 * 60 * 1000)))
}

export const canUsePaidEntitlement = (args: {
  status: string | null | undefined
  entitlementEnd?: string | null
  tokenLimit?: number | null
  tokenUsed?: number | null
  estimatedTokens?: number
}): boolean => {
  const status = String(args.status || '')
  if (!SUBSCRIPTION_USABLE_WITH_TIME_AND_TOKENS.has(status)) return false
  if (!args.entitlementEnd || Date.parse(args.entitlementEnd) <= Date.now())
    return false
  const estimated = Math.max(0, Math.floor(args.estimatedTokens || 0))
  const limit = Number(args.tokenLimit || 0)
  const used = Number(args.tokenUsed || 0)
  return limit > 0 && used + estimated <= limit
}

export const normalizePeriodPoint = (value: number | string): string => {
  const raw = String(value).trim()
  const numeric = Number(raw)
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 31) {
    throw new Error('INVALID_PERIOD_POINT')
  }
  return String(numeric).padStart(2, '0')
}
