import type { SupabaseClient } from '@supabase/supabase-js'

export const writeBillingAuditLog = async (args: {
  supa: SupabaseClient
  adminUserId: string
  companyId?: string | null
  action: string
  targetType: string
  targetId?: string | null
  beforeValue?: Record<string, unknown> | null
  afterValue?: Record<string, unknown> | null
  reason: string
}): Promise<void> => {
  if (!args.reason || !args.reason.trim()) throw new Error('REASON_REQUIRED')
  const { error } = await args.supa.from('admin_billing_audit_logs').insert({
    admin_user_id: args.adminUserId,
    company_id: args.companyId || null,
    action: args.action,
    target_type: args.targetType,
    target_id: args.targetId || null,
    before_value: args.beforeValue || null,
    after_value: args.afterValue || null,
    reason: args.reason.trim(),
  })
  if (error) throw new Error('AUDIT_LOG_FAILED')
}
