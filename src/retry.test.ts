import { describe, expect, it, vi } from "vitest";
import { runWithRetry, toRetryDelays } from "./retry";

describe("toRetryDelays", () => {
  it("creates incremental retry delays", () => {
    expect(toRetryDelays(200, 3)).toEqual([200, 400, 600]);
  });

  it("returns empty array for invalid inputs", () => {
    expect(toRetryDelays(0, 3)).toEqual([]);
    expect(toRetryDelays(100, 0)).toEqual([]);
  });
});

describe("runWithRetry", () => {
  it("retries and succeeds on subsequent attempt", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue("ok");

    const result = await runWithRetry(operation, { delaysMs: [0, 0] });

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("stops retrying when shouldRetry returns false", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("do not retry"));

    await expect(
      runWithRetry(operation, {
        delaysMs: [0, 0],
        shouldRetry: () => false,
      }),
    ).rejects.toThrow("do not retry");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("invokes onRetry callback with retry context", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue("ok");
    const onRetry = vi.fn();

    await runWithRetry(operation, {
      delaysMs: [0],
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({
      attempt: 1,
      delayMs: 0,
    });
  });
});
