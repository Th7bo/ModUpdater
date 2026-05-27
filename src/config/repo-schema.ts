import { z } from 'zod'

export const CreateRepoSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  gitUrl: z.string().url('Must be a valid URL'),
  mode: z.enum(['upstream', 'fork']),
  branch: z.string().min(1, 'Branch is required'),
  detectionMethod: z.enum(['polling', 'webhook']),
  pollingIntervalMs: z.number().int().positive().optional(),
  discordChannelId: z.string().min(1, 'Discord channel ID is required'),
  customBuildTask: z.string().optional(),
  webhookSecret: z.string().optional(),
  upstreamUrl: z.string().url().optional(),
})

export const UpdateRepoSchema = CreateRepoSchema.partial().extend({
  sshPrivateKeyContent: z.string().optional(),
})

export type CreateRepoInput = z.infer<typeof CreateRepoSchema>
export type UpdateRepoInput = z.infer<typeof UpdateRepoSchema>
