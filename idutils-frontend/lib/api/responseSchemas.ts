import { z } from 'zod'
import { Role } from '@/lib/domain/role'

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(Role),
})

export const sessionEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: userSchema,
})

export const emptySuccessEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
})

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  details: z.array(z.string()).optional(),
})
