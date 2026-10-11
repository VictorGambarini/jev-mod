import express from 'express'

// Keeps the request body as bytes: the provider's signature is computed over exactly what was sent.
export const rawBody = express.raw({ type: 'application/json', limit: '1mb' })
