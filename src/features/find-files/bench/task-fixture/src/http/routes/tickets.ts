import { Router } from 'express'
import { createTicket, deleteTicket, getTicket, listTickets } from '../../tickets/service'

export const ticketsRoutes = Router()

ticketsRoutes.get('/tickets', async (req, res) => res.json(await listTickets({ limit: Number(req.query.limit ?? 50) })))
ticketsRoutes.get('/tickets/:id', async (req, res) => res.json(await getTicket(req.params.id!)))
ticketsRoutes.post('/tickets', async (req, res) => res.status(201).json(await createTicket(req.body)))
ticketsRoutes.delete('/tickets/:id', async (req, res) => { await deleteTicket(req.params.id!); res.status(204).end() })
