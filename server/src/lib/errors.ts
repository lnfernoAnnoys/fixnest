/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}
export const badRequest = (m: string, code?: string) => new HttpError(400, m, code)
export const unauthorized = (m = 'Please log in to continue.') => new HttpError(401, m, 'UNAUTHORIZED')
export const forbidden = (m = "You don't have access to that.") => new HttpError(403, m, 'FORBIDDEN')
export const notFound = (m = 'Not found.') => new HttpError(404, m, 'NOT_FOUND')
export const conflict = (m: string, code?: string) => new HttpError(409, m, code)
