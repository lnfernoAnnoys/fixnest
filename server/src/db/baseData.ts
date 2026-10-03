import { db } from './connection.js'

export const DEFAULT_CATEGORIES = [
  'Electrical',
  'Plumbing',
  'Furniture',
  'Wi-Fi / Internet',
  'Cleaning',
  'Water Supply',
  'Room Maintenance',
  'Other',
]

/** Data the app needs to function in every environment. Safe to run on every start. */
export function ensureBaseData() {
  const insert = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)')
  for (const name of DEFAULT_CATEGORIES) insert.run(name)
}
