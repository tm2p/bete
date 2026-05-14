import { expect, test } from "vitest";
import { UserStateUpdate, validateUserStateUpdate } from "../src/validation";

test("valid object returns typed object", async () => {
  const input = {
    userId: "123",
    username: "testuser",
    avatar: "avatar.png",
    speaking: true,
  };
  const result = await validateUserStateUpdate(input);
  expect(result).toEqual(input as UserStateUpdate);
});

test("non-object input returns null", async () => {
  // @ts-expect-error testing invalid input
  const result = await validateUserStateUpdate("not an object");
  expect(result).toBeNull();
});

test("invalid field types return null", async () => {
  const input = {
    userId: "123",
    username: "testuser",
    avatar: "avatar.png",
    speaking: "true", // invalid type
  };
  const result = await validateUserStateUpdate(input as unknown);
  expect(result).toBeNull();
});
