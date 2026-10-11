export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} not found`)
export const badRequest = (message: string) => new AppError(400, 'bad_request', message)
export const conflict = (message: string) => new AppError(409, 'conflict', message)
