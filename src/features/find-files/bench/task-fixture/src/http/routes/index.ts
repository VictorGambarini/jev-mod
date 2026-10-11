import { Router } from 'express'
import { customersExport } from './customers-export'

export const routes = Router()
routes.use(customersExport)
