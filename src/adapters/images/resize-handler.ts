import { resizeImage } from "./resize.ts";

/** The bucket operations the resize handler needs. */
export interface ObjectStore {
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type Log = (line: string) => void;

const PENDING_KEY = /^pending\/([a-z0-9]{1,40})\/([a-z0-9]{1,40})$/;

/** The ids in an S3 event key, which arrives URL-encoded with "+" for spaces; null for any other key. */
export function parsePendingKey(rawKey: string): { eventId: string; imageId: string } | null {
  let key: string;
  try {
    key = decodeURIComponent(rawKey.replace(/\+/g, " "));
  } catch {
    return null;
  }
  const match = PENDING_KEY.exec(key);
  return match ? { eventId: match[1], imageId: match[2] } : null;
}

export function outputKey(eventId: string, imageId: string): string {
  return `images/${eventId}/${imageId}.webp`;
}

export function failedKey(eventId: string, imageId: string): string {
  return `failed/${eventId}/${imageId}`;
}

/** Resizes one upload to images/, or records why not under failed/, then removes it from pending/. */
export async function handleUpload(rawKey: string, store: ObjectStore, log: Log): Promise<void> {
  const ids = parsePendingKey(rawKey);
  if (!ids) {
    log(`resize: ignored key ${JSON.stringify(rawKey)}`);
    return;
  }
  const pending = `pending/${ids.eventId}/${ids.imageId}`;
  const result = await resizeImage(await store.get(pending));
  if (result.ok) {
    const output = outputKey(ids.eventId, ids.imageId);
    await store.put(output, result.data, "image/webp");
    await store.delete(pending);
    log(`resize: ${pending} resized to ${output} (${result.width}x${result.height})`);
  } else {
    const failed = failedKey(ids.eventId, ids.imageId);
    await store.put(failed, Buffer.from(JSON.stringify({ reason: result.reason })), "application/json");
    await store.delete(pending);
    log(`resize: ${pending} refused (${result.reason})`);
  }
}
