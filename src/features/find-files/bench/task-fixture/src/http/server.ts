import express from 'express'
import { env } from '../config/env'
import { startSchedules } from '../jobs/schedules'
import { inbound } from '../webhooks/inbound/router'
import { apiKeyAuth } from './middleware/api-key-auth'
import { rateLimit } from './middleware/rate-limit'
import { routes } from './routes'

const app = express()
app.use(inbound)
app.use(express.json())
app.use('/api', apiKeyAuth, rateLimit, routes)
startSchedules()
app.listen(env.PORT)
