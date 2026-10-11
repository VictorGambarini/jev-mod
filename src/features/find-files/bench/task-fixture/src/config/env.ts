import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PAYMENT_PROVIDER_SECRET: z.string().min(8),
  WEBHOOK_SIGNING_SECRET: z.string().min(8),
})

export const env = schema.parse(process.env)
