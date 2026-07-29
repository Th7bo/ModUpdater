import { pgTable, text, boolean, integer, timestamp, uuid, primaryKey } from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from 'next-auth/adapters'

export const repos = pgTable('repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  gitUrl: text('git_url').notNull(),
  mode: text('mode', { enum: ['upstream', 'fork'] }).notNull(),
  branch: text('branch').notNull(),
  detectionMethod: text('detection_method', { enum: ['polling', 'webhook'] }).notNull(),
  pollingIntervalMs: integer('polling_interval_ms'),
  discordChannelId: text('discord_channel_id').notNull(),
  customBuildTask: text('custom_build_task'),
  jdkVersion: text('jdk_version', { enum: ['21', '25'] }).default('21'),
  notifyOnBuildStart: boolean('notify_on_build_start').notNull().default(false),
  artifactExcludePatterns: text('artifact_exclude_patterns').notNull().default(''),
  sshPrivateKeyPath: text('ssh_private_key_path'),
  sshPublicKey: text('ssh_public_key'),
  webhookSecret: text('webhook_secret'),
  upstreamUrl: text('upstream_url'),
  syncPaused: boolean('sync_paused').notNull().default(false),
  lastCommitHash: text('last_commit_hash'),
  lastBuildStatus: text('last_build_status', {
    enum: ['success', 'failed', 'paused', 'pending'],
  }),
  lastBuildAt: timestamp('last_build_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── Auth.js adapter tables ────────────────────────────────────────────────

export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
})

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
)

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
)

// ─── Build tables ───────────────────────────────────────────────────────────

export const buildRuns = pgTable('build_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repos.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['success', 'failed'] }).notNull(),
  triggeredBy: text('triggered_by', {
    enum: ['poll', 'webhook', 'manual', 'sync'],
  }).notNull(),
  commitsJson: text('commits_json').notNull(),
  artifactPathsJson: text('artifact_paths_json'),
  logTail: text('log_tail'),
  logPath: text('log_path'),
  startedAt: timestamp('started_at').notNull(),
  finishedAt: timestamp('finished_at'),
})
