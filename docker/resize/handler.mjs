// Lambda handler that resizes each image S3 reports under pending/.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { handleUpload } from "./resize-handler.ts";

// Created once per container and reused across invocations.
const s3 = new S3Client({});

function bucketStore(bucket) {
  return {
    async get(key) {
      const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await response.Body.transformToByteArray());
    },
    async put(key, body, contentType) {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

// Records are handled one after another; a throw fails the invocation so Lambda retries it.
export async function handler(event) {
  for (const record of event.Records ?? []) {
    await handleUpload(record.s3.object.key, bucketStore(record.s3.bucket.name), console.log);
  }
}
