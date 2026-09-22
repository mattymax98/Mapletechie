import { describe, expect, it } from "vitest";
import { validateDevelopmentStorageAccess } from "./objectStorage";

type SentCommand = {
  constructor: { name: string };
  input: { Bucket?: string; Key?: string; Body?: Uint8Array };
};

function accessDenied(): Error {
  return Object.assign(new Error("Access denied"), {
    name: "AccessDenied",
    $metadata: { httpStatusCode: 403 },
  });
}

describe("validateDevelopmentStorageAccess", () => {
  it("proves development read/write access and production denial", async () => {
    const sent: SentCommand[] = [];
    let uploaded: Uint8Array | undefined;
    const client = {
      send: async (command: SentCommand) => {
        sent.push(command);
        if (command.constructor.name === "PutObjectCommand") {
          uploaded = command.input.Body;
          return {};
        }
        if (command.constructor.name === "GetObjectCommand") {
          return {
            Body: {
              transformToByteArray: async () => uploaded,
            },
          };
        }
        if (command.constructor.name === "HeadBucketCommand") {
          throw accessDenied();
        }
        return {};
      },
    };

    await expect(validateDevelopmentStorageAccess(client as never)).resolves.toBeUndefined();
    expect(sent.map((command) => command.constructor.name)).toEqual([
      "PutObjectCommand",
      "GetObjectCommand",
      "HeadBucketCommand",
      "DeleteObjectCommand",
    ]);
    expect(sent[0].input.Bucket).toBe("mapletechie-development");
    expect(sent[2].input).toEqual({ Bucket: "mapletechie" });
    expect(sent[3].input).toEqual({
      Bucket: "mapletechie-development",
      Key: sent[0].input.Key,
    });
  });

  it("fails when the development credentials can access production", async () => {
    let uploaded: Uint8Array | undefined;
    const sent: SentCommand[] = [];
    const client = {
      send: async (command: SentCommand) => {
        sent.push(command);
        if (command.constructor.name === "PutObjectCommand") {
          uploaded = command.input.Body;
        }
        if (command.constructor.name === "GetObjectCommand") {
          return {
            Body: { transformToByteArray: async () => uploaded },
          };
        }
        return {};
      },
    };

    await expect(validateDevelopmentStorageAccess(client as never)).rejects.toThrow(
      "Unsafe development storage credentials",
    );
    expect(sent.at(-1)?.constructor.name).toBe("DeleteObjectCommand");
    expect(
      sent.filter((command) => command.input.Bucket === "mapletechie"),
    ).toHaveLength(1);
  });

  it("removes the disposable object after a partial failure", async () => {
    const sent: SentCommand[] = [];
    const client = {
      send: async (command: SentCommand) => {
        sent.push(command);
        if (command.constructor.name === "GetObjectCommand") {
          throw new Error("read failed");
        }
        return {};
      },
    };

    await expect(validateDevelopmentStorageAccess(client as never)).rejects.toThrow(
      "read failed",
    );
    expect(sent.map((command) => command.constructor.name)).toEqual([
      "PutObjectCommand",
      "GetObjectCommand",
      "DeleteObjectCommand",
    ]);
    expect(sent[2].input.Key).toBe(sent[0].input.Key);
  });
});