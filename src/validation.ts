import { plainToClass } from "class-transformer";
import { IsBoolean, IsString, validate } from "class-validator";

export class UserStateUpdate {
  @IsString()
  userId!: string;

  @IsString()
  username!: string;

  @IsString()
  avatar!: string;

  @IsBoolean()
  speaking!: boolean;
}

export class AudioMessage {
  data!: Buffer;
  userId!: string;
}

export async function validateUserStateUpdate(
  data: unknown,
): Promise<UserStateUpdate | null> {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const obj = plainToClass(UserStateUpdate, data);
  const errors = await validate(obj);

  if (errors.length > 0) {
    return null;
  }

  return obj;
}
