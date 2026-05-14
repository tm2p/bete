import { z } from "zod";

export const userStateUpdateSchema = z.object({
  userId: z.string(),
  username: z.string(),
  avatar: z.string(),
  speaking: z.boolean(),
});

export type UserStateUpdate = z.infer<typeof userStateUpdateSchema>;

export interface AudioMessage {
  data: Buffer;
  userId: string;
}

export async function validateUserStateUpdate(
  data: unknown,
): Promise<UserStateUpdate | null> {
  const result = userStateUpdateSchema.safeParse(data);
  return result.success ? result.data : null;
}
