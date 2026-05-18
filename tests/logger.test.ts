import { describe, expect, it } from "vitest";
import { formatLogMetadataForTest, serializeLogValueForTest } from "../src/logger";

class TestError extends Error {
  public code = "TEST_CODE";
  public statusCode = 418;

  constructor() {
    super("test failure");
    this.name = "TestError";
  }
}

describe("logger serialization", () => {
  it("serializes Error values with stable fields", () => {
    const serialized = serializeLogValueForTest(new TestError());

    expect(serialized).toMatchObject({
      name: "TestError",
      message: "test failure",
      code: "TEST_CODE",
      statusCode: 418,
    });
    expect(serialized).toHaveProperty("stack");
  });

  it("serializes nested error metadata keys", () => {
    const error = new TestError();

    expect(formatLogMetadataForTest({ error, err: error, reason: error })).toMatchObject({
      error: {
        name: "TestError",
        message: "test failure",
        code: "TEST_CODE",
        statusCode: 418,
      },
      err: {
        name: "TestError",
        message: "test failure",
        code: "TEST_CODE",
        statusCode: 418,
      },
      reason: {
        name: "TestError",
        message: "test failure",
        code: "TEST_CODE",
        statusCode: 418,
      },
    });
  });

  it("preserves plain metadata", () => {
    expect(
      formatLogMetadataForTest({ context: "bot", signal: "SIGINT", count: 2 }),
    ).toEqual({ context: "bot", signal: "SIGINT", count: 2 });
  });
});