import type { z } from 'zod'
import { badRequest } from './errors.js'

/** Parse untrusted input; throws a 400 with the first readable message. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue.path.join('.')
    throw badRequest(field ? `${field}: ${issue.message}` : issue.message, 'VALIDATION')
  }
  return result.data
}
