import type { SupabaseClient } from '@supabase/supabase-js'

export type ReserveBillingTokensInput = {
  supa: SupabaseClient
  companyId: string
  requestId: string
  requestType: string
  model?: string | null
  estimatedTokens: number
  subscriptionId?: string | null
  adminEntitlementId?: string | null
  interviewId?: string | null
}

export type ReserveInterviewAllocationTokensInput = {
  supa: SupabaseClient
  companyId: string
  interviewId: string
  requestId: string
  requestType: string
  model?: string | null
  estimatedTokens: number
}

export const reserveCompanyBillingTokens = async (
  input: ReserveBillingTokensInput
) =>
  input.supa.rpc('reserve_company_billing_tokens', {
    p_company_id: input.companyId,
    p_request_id: input.requestId,
    p_request_type: input.requestType,
    p_model: input.model || null,
    p_estimated_tokens: input.estimatedTokens,
    p_subscription_id: input.subscriptionId || null,
    p_admin_entitlement_id: input.adminEntitlementId || null,
    p_interview_id: input.interviewId || null,
  })

export const reserveInterviewAllocationTokens = async (
  input: ReserveInterviewAllocationTokensInput
) =>
  input.supa.rpc('reserve_interview_allocation_tokens', {
    p_interview_id: input.interviewId,
    p_company_id: input.companyId,
    p_request_id: input.requestId,
    p_request_type: input.requestType,
    p_model: input.model || null,
    p_estimated_tokens: input.estimatedTokens,
  })

export const finalizeCompanyBillingTokens = async (
  supa: SupabaseClient,
  requestId: string,
  inputTokens: number,
  outputTokens: number
) =>
  supa.rpc('finalize_company_billing_tokens', {
    p_request_id: requestId,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
  })

export const finalizeInterviewAllocationTokens = async (
  supa: SupabaseClient,
  requestId: string,
  inputTokens: number,
  outputTokens: number
) =>
  supa.rpc('finalize_interview_allocation_tokens', {
    p_request_id: requestId,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
  })

export const releaseCompanyBillingTokens = async (
  supa: SupabaseClient,
  requestId: string,
  reason?: string
) =>
  supa.rpc('release_company_billing_tokens', {
    p_request_id: requestId,
    p_reason: reason || null,
  })

export const releaseInterviewAllocationTokens = async (
  supa: SupabaseClient,
  requestId: string,
  reason?: string
) =>
  supa.rpc('release_interview_allocation_tokens', {
    p_request_id: requestId,
    p_reason: reason || null,
  })
