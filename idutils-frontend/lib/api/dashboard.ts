import { z } from 'zod'
import { apiFetch } from './client'

const dashboardSummarySchema = z.object({
  warningDays: z.number(),
  counters: z.object({
    activePatients: z.number(),
    activeCareServices: z.number(),
    expiringSoon: z.number(),
    expired: z.number(),
    withoutAuthorization: z.number(),
    pendingClaims: z.number(),
  }),
})

const dashboardEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: dashboardSummarySchema,
})

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>

export async function getDashboard(): Promise<DashboardSummary> {
  const response = await apiFetch('/api/dashboard', {}, dashboardEnvelopeSchema.parse)
  return response.data
}
