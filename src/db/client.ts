import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { parseConfig } from '@/src/config/env'
import * as schema from '@/src/db/schema'

const { DATABASE_URL } = parseConfig()

const pool = new Pool({ connectionString: DATABASE_URL })

export const db = drizzle(pool, { schema })

export type Db = typeof db
