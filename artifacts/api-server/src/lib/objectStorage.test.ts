import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as unknown[],
  inputs: [] as Array<Record<string, unknown>>,
  clientOptions: null as Record<string, unknown> | null,
}));

vi.mock("@aws-sdk/client-s3", () => {
  class FakeCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }

  class FakeS3Client {
    constructor(options: Record<string, unknown>) {
      state.clientOptions = options;
    }

    async send(command: FakeCommand): Promise<unknown> {
      state.inputs.push(command.input);
      const response = state.responses.shift();
      if (response instanceof Error) throw response;
      return response ?? {};
    }
  }

  return {
    S3Client: FakeS3Client,
    HeadObjectCommand: FakeCommand,
    GetObjectCommand: FakeCommand,
    CopyObjectCommand: FakeCommand,
    PutObjectCommand: FakeCommand,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://r2.example.test/signed-upload"),
}));

const { ObjectNotFoundError, ObjectStorageService } = await import("./objectStorage");

const R2_ENV = {
  R2_ACCOUNT_ID: "account-test",
  R2_ACCESS_KEY_ID: "access-key",
  R2_SECRET_ACCESS_KEY: "secret-key",
  PRIVATE_OBJECT_DIR: "/private-bucket/.private",
  PUBLIC_OBJECT_SEARCH_PATHS: "/public-bucket/assets,/fallback-bucket/assets",
};

const originalEnv = { ...process.env };

beforeEach(() => {
  for (const key of Object.keys(R2_ENV)) delete process.env[key];
  Object.assign(process.env, R2_ENV);
  state.responses.length = 0;
  state.inputs.length = 0;
  state.clientOptions = null;
});

afterEach(() => {
  for (const key of Object.keys(R2_ENV)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

describe("ObjectStorageService R2 backend", () => {
  it("reports every missing R2 credential clearly", async () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;

    await expect(new ObjectStorageService().getObjectEntityUploadURL()).rejects.toThrow(
      "Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY",
    );
  });

  it("searches public paths and preserves the ACL metadata alias", async () => {
    state.responses.push({});
    const service = new ObjectStorageService();
    const file = await service.searchPublicObject("cover.webp");

    expect(file).not.toBeNull();
    expect(state.inputs[0]).toEqual({
      Bucket: "public-bucket",
      Key: "assets/cover.webp",
    });

    state.responses.push({
      ContentType: "image/webp",
      ContentLength: 42,
      Metadata: { aclpolicy: '{"visibility":"public"}' },
    });
    const [metadata] = await file!.getMetadata();
    expect(metadata).toEqual({
      contentType: "image/webp",
      size: 42,
      metadata: {
        aclpolicy: '{"visibility":"public"}',
        "custom:aclPolicy": '{"visibility":"public"}',
      },
    });
  });

  it("uses R2 presigned URLs and server-side uploads", async () => {
    const service = new ObjectStorageService();
    const uploadUrl = await service.getObjectEntityUploadURL();

    expect(uploadUrl).toBe("https://r2.example.test/signed-upload");

    const objectPath = await service.putObjectEntity(
      Buffer.from("image"),
      "image/png",
    );
    expect(objectPath).toMatch(/^\/objects\/uploads\/[0-9a-f-]+$/);
    expect(state.inputs[0]).toMatchObject({
      Bucket: "private-bucket",
      Body: Buffer.from("image"),
      ContentType: "image/png",
      ContentLength: 5,
    });
  });

  it("reads R2 objects and maps missing objects to ObjectNotFoundError", async () => {
    const service = new ObjectStorageService();
    state.responses.push({});
    const file = await service.getObjectEntityFile("/objects/uploads/file-id");
    expect(file.bucket.name).toBe("private-bucket");
    expect(file.name).toBe(".private/uploads/file-id");

    state.responses.push(Object.assign(new Error("missing"), {
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    }));
    await expect(
      service.getObjectEntityFile("/objects/uploads/missing-id"),
    ).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it("updates metadata through R2 copy-to-self while preserving existing values", async () => {
    state.responses.push({
      ContentType: "image/png",
      ContentLength: 5,
      Metadata: { source: "upload", aclpolicy: "old-policy" },
    });
    const service = new ObjectStorageService();
    const file = await service.getObjectEntityFile("/objects/uploads/file-id");
    state.responses.push({
      ContentType: "image/png",
      ContentLength: 5,
      Metadata: { source: "upload", aclpolicy: "old-policy" },
    });
    await file.setMetadata({
      metadata: { "custom:aclPolicy": "new-policy" },
    });

    expect(state.inputs[2]).toMatchObject({
      Bucket: "private-bucket",
      Key: ".private/uploads/file-id",
      CopySource: "private-bucket/.private/uploads/file-id",
      Metadata: { source: "upload", aclpolicy: "new-policy" },
      MetadataDirective: "REPLACE",
    });
  });

  it("normalizes only current R2 object URLs", () => {
    const service = new ObjectStorageService();
    expect(
      service.normalizeObjectEntityPath(
        "https://account-test.r2.cloudflarestorage.com/private-bucket/.private/uploads/file-id",
      ),
    ).toBe("/objects/uploads/file-id");
    expect(
      service.normalizeObjectEntityPath(
        "https://legacy-storage.example.test/private-bucket/.private/uploads/file-id",
      ),
    ).toBe(
      "https://legacy-storage.example.test/private-bucket/.private/uploads/file-id",
    );
  });
});