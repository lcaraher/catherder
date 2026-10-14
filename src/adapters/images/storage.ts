// Where event pictures are kept: the images bucket when IMAGES_BUCKET is set, otherwise a local folder in development.

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { MAX_IMAGE_BYTES } from "../../domain/images.ts";
import { failedKey, outputKey, type ObjectStore } from "./resize-handler.ts";

export type ImageState = { state: "ready" } | { state: "pending" } | { state: "refused"; reason: string };

export interface UploadForm {
  url: string;
  fields: Record<string, string>;
}

interface StorageOperations {
  /** A form the browser posts the file with, to pending/<eventId>/<imageId>. */
  createUpload(eventId: string, imageId: string, contentType: string): Promise<UploadForm>;
  state(eventId: string, imageId: string): Promise<ImageState>;
  /** The resized WebP, or null when there is none. */
  read(eventId: string, imageId: string): Promise<Buffer | null>;
  /** Deletes the resized WebP; a missing one is fine. */
  remove(eventId: string, imageId: string): Promise<void>;
}

export type ImageStorage =
  | (StorageOperations & { kind: "s3" })
  | (StorageOperations & { kind: "local"; store: ObjectStore });

/** Thrown when production has no images bucket; uploads are then refused, never kept locally. */
export class ImageStorageUnavailableError extends Error {}

const ID = /^[a-z0-9]{1,40}$/;

// Ids come from database rows; this keeps a bad one from naming another key or path.
function checkIds(eventId: string, imageId: string): void {
  if (!ID.test(eventId) || !ID.test(imageId)) throw new Error("invalid picture id");
}

export function pendingKey(eventId: string, imageId: string): string {
  checkIds(eventId, imageId);
  return `pending/${eventId}/${imageId}`;
}

function parseFailedNote(text: string): string {
  try {
    const reason = (JSON.parse(text) as { reason?: unknown }).reason;
    return typeof reason === "string" ? reason : "not-an-image";
  } catch {
    return "not-an-image";
  }
}

function isMissingFile(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "ENOENT";
}

function localStorage(root: string): ImageStorage {
  const file = (key: string) => path.join(root, ...key.split("/"));
  const store: ObjectStore = {
    get: (key) => readFile(file(key)),
    put: async (key, body) => {
      await mkdir(path.dirname(file(key)), { recursive: true });
      await writeFile(file(key), body);
    },
    delete: (key) => rm(file(key), { force: true }),
  };
  return {
    kind: "local",
    store,
    createUpload: async (eventId, imageId, contentType) => ({
      url: "/api/images/local-upload",
      fields: { key: pendingKey(eventId, imageId), "Content-Type": contentType },
    }),
    state: async (eventId, imageId) => {
      checkIds(eventId, imageId);
      try {
        await stat(file(outputKey(eventId, imageId)));
        return { state: "ready" };
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
      try {
        const note = await readFile(file(failedKey(eventId, imageId)), "utf8");
        return { state: "refused", reason: parseFailedNote(note) };
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
      return { state: "pending" };
    },
    read: async (eventId, imageId) => {
      checkIds(eventId, imageId);
      try {
        return await readFile(file(outputKey(eventId, imageId)));
      } catch (error) {
        if (isMissingFile(error)) return null;
        throw error;
      }
    },
    remove: async (eventId, imageId) => {
      checkIds(eventId, imageId);
      await rm(file(outputKey(eventId, imageId)), { force: true });
    },
  };
}

let s3Client: Promise<S3Client> | undefined;

// The SDK is loaded on first use; dual-stack because the app reaches AWS over IPv6 only.
function client(): Promise<S3Client> {
  s3Client ??= import("@aws-sdk/client-s3").then(
    ({ S3Client }) =>
      new S3Client({ region: process.env.AWS_REGION ?? "us-east-2", useDualstackEndpoint: true }),
  );
  return s3Client;
}

// HeadObject answers NotFound and GetObject NoSuchKey, both 404 since the app may list the bucket.
function isMissingObject(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

function s3Storage(bucket: string): ImageStorage {
  const getBytes = async (key: string): Promise<Buffer | null> => {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const response = await (await client()).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!response.Body) throw new Error("object has no body");
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  };
  return {
    kind: "s3",
    createUpload: async (eventId, imageId, contentType) => {
      const { createPresignedPost } = await import("@aws-sdk/s3-presigned-post");
      const { url, fields } = await createPresignedPost(await client(), {
        Bucket: bucket,
        Key: pendingKey(eventId, imageId),
        Fields: { "Content-Type": contentType },
        Conditions: [
          ["content-length-range", 1, MAX_IMAGE_BYTES],
          ["eq", "$Content-Type", contentType],
        ],
        Expires: 300,
      });
      return { url, fields };
    },
    state: async (eventId, imageId) => {
      checkIds(eventId, imageId);
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      try {
        await (await client()).send(
          new HeadObjectCommand({ Bucket: bucket, Key: outputKey(eventId, imageId) }),
        );
        return { state: "ready" };
      } catch (error) {
        if (!isMissingObject(error)) throw error;
      }
      const note = await getBytes(failedKey(eventId, imageId));
      if (note) return { state: "refused", reason: parseFailedNote(note.toString("utf8")) };
      return { state: "pending" };
    },
    read: async (eventId, imageId) => {
      checkIds(eventId, imageId);
      return getBytes(outputKey(eventId, imageId));
    },
    remove: async (eventId, imageId) => {
      checkIds(eventId, imageId);
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await (await client()).send(
        new DeleteObjectCommand({ Bucket: bucket, Key: outputKey(eventId, imageId) }),
      );
    },
  };
}

/** The bucket when IMAGES_BUCKET is set; the local folder outside production; otherwise unavailable. */
export function getImageStorage(): ImageStorage {
  const bucket = process.env.IMAGES_BUCKET;
  if (bucket) return s3Storage(bucket);
  if (process.env.NODE_ENV === "production") {
    throw new ImageStorageUnavailableError("IMAGES_BUCKET is not set");
  }
  return localStorage(process.env.IMAGES_LOCAL_DIR ?? path.join(process.cwd(), ".local-images"));
}
