import { pgTable, text, boolean, integer, timestamp, uuid } from 'drizzle-orm/pg-core'

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

export const buildRuns = pgTable('build_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repos.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['success', 'failed'] }).notNull(),
  triggeredBy: text('triggered_by', {
    enum: ['poll', 'webhook', 'manual', 'rebase'],
  }).notNull(),
  commitsJson: text('commits_json').notNull(),
  artifactPathsJson: text('artifact_paths_json'),
  logTail: text('log_tail'),
  startedAt: timestamp('started_at').notNull(),
  finishedAt: timestamp('finished_at'),
})
