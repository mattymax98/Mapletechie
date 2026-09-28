import { describe, expect, it, vi } from "vitest";
import { VariantQueueFullError, VariantWorkQueue } from "./variantWork";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("VariantWorkQueue", () => {
  it("shares a single cold miss, bounds distinct work, and serves waiting readers", async () => {
    const queue = new VariantWorkQueue<string>(1, 1);
    const first = deferred<string>();
    const second = deferred<string>();
    const firstWork = vi.fn(() => first.promise);
    const secondWork = vi.fn(() => second.promise);

    const a = queue.run("16-9:/objects/a", firstWork);
    const duplicate = queue.run("16-9:/objects/a", firstWork);
    const b = queue.run("4-3:/objects/b", secondWork);
    expect(duplicate).toBe(a);
    expect(firstWork).toHaveBeenCalledTimes(1);
    expect(secondWork).not.toHaveBeenCalled();
    await expect(queue.run("1-1:/objects/c", async () => "c")).rejects.toBeInstanceOf(VariantQueueFullError);
    expect(queue.run("4-3:/objects/b", secondWork)).toBe(b);

    first.resolve("first image");
    expect(await Promise.all([a, duplicate])).toEqual(["first image", "first image"]);
    expect(secondWork).toHaveBeenCalledTimes(1);
    second.resolve("second image");
    expect(await b).toBe("second image");

    expect(await queue.run("16-9:/objects/a", async () => "fresh image")).toBe("fresh image");
  });

  it("releases a failed slot and lets a later request retry the same variant", async () => {
    const queue = new VariantWorkQueue<string>(1, 0);
    const failed = deferred<string>();
    const a = queue.run("a", () => failed.promise);
    const duplicate = queue.run("a", async () => "unused");
    const failure = new Error("storage unavailable");
    failed.reject(failure);
    await expect(a).rejects.toBe(failure);
    await expect(duplicate).rejects.toBe(failure);
    expect(await queue.run("a", async () => "recovered")).toBe("recovered");
  });
});