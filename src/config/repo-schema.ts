import { z } from 'zod'

export const CreateRepoSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  gitUrl: z.string().min(1, 'Git URL is required').refine(
    (v) => /^(https?:\/\/.+|git@.+:.+\.git)$/.test(v),
    'Must be a valid HTTPS or SSH git URL'
  ),
  mode: z.enum(['upstream', 'fork']),
  branch: z.string().min(1, 'Branch is required'),
  detectionMethod: z.enum(['polling', 'webhook']),
  pollingIntervalMs: z.number().int().positive().optional(),
  discordChannelId: z.string().min(1, 'Discord channel ID is required'),
  customBuildTask: z.string().optional(),
  jdkVersion: z.enum(['21', '25']).optional(),
  notifyOnBuildStart: z.boolean().optional(),
  artifactExcludePatterns: z.string().max(4000, 'Artifact exclusion patterns are too long').optional(),
  webhookSecret: z.string().optional(),
  upstreamUrl: z.string().refine(
    (v) => /^(https?:\/\/.+|git@.+:.+\.git)$/.test(v),
    'Must be a valid HTTPS or SSH git URL'
  ).optional(),
})

export const UpdateRepoSchema = CreateRepoSchema.partial().extend({
  sshPrivateKeyContent: z.string().optional(),
})

export type CreateRepoInput = z.infer<typeof CreateRepoSchema>
export type UpdateRepoInput = z.infer<typeof UpdateRepoSchema>
