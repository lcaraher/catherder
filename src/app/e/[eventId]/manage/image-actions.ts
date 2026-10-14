"use server";

import { prisma } from "@/adapters/db/client";
import { getImageStorage, type ImageStorage, type UploadForm } from "@/adapters/images/storage";
import {
  IMAGE_TYPES,
  IMAGES_PER_EVENT,
  MAX_IMAGE_BYTES,
  UPLOAD_WINDOW_MS,
  UPLOADS_PER_DAY,
  imageAddress,
  refusalMessage,
} from "@/domain/images";
import { requireEventManager } from "./event-manager";

type UploadRequestResult =
  | { ok: true; imageId: string; upload: UploadForm }
  | { ok: false; message: string };

type ImageStatus =
  | { state: "pending" }
  | { state: "ready"; src: string }
  | { state: "refused"; message: string };

function refuse(reason: string): UploadRequestResult {
  return { ok: false, message: refusalMessage(reason) };
}

function storageOrNull(): ImageStorage | null {
  try {
    return getImageStorage();
  } catch {
    return null;
  }
}

/** Records a picture for the event and returns the form its file is posted with, or why not. */
export async function requestImageUpload(input: {
  eventId: string;
  contentType: string;
  size: number;
}): Promise<UploadRequestResult> {
  const eventId = String(input.eventId ?? "");
  const { user } = await requireEventManager(eventId);

  const contentType = String(input.contentType ?? "");
  if (!IMAGE_TYPES.includes(contentType)) return refuse("type");
  const size = Number(input.size);
  if (!Number.isInteger(size) || size < 1 || size > MAX_IMAGE_BYTES) return refuse("size");
  if ((await prisma.eventImage.count({ where: { eventId } })) >= IMAGES_PER_EVENT) {
    return refuse("per-event");
  }
  const recent = await prisma.eventImage.count({
    where: { uploaderUserId: user.id, createdAt: { gt: new Date(Date.now() - UPLOAD_WINDOW_MS) } },
  });
  if (recent >= UPLOADS_PER_DAY) return refuse("per-day");
  const storage = storageOrNull();
  if (!storage) return refuse("unavailable");

  const image = await prisma.eventImage.create({ data: { eventId, uploaderUserId: user.id } });
  try {
    return { ok: true, imageId: image.id, upload: await storage.createUpload(eventId, image.id, contentType) };
  } catch {
    // No form, so no upload can follow; the row would only count against the limits.
    await prisma.eventImage.delete({ where: { id: image.id } });
    return refuse("unavailable");
  }
}

/** Whether an uploaded picture is ready, still being resized, or refused. */
export async function imageStatus(input: { eventId: string; imageId: string }): Promise<ImageStatus> {
  const eventId = String(input.eventId ?? "");
  await requireEventManager(eventId);
  const imageId = String(input.imageId ?? "");
  const image = await prisma.eventImage.findFirst({ where: { id: imageId, eventId } });
  if (!image) return { state: "refused", message: refusalMessage("not-an-image") };
  const storage = storageOrNull();
  if (!storage) return { state: "refused", message: refusalMessage("unavailable") };

  const result = await storage.state(eventId, imageId);
  if (result.state === "ready") return { state: "ready", src: imageAddress(eventId, imageId) };
  if (result.state === "refused") return { state: "refused", message: refusalMessage(result.reason) };
  return { state: "pending" };
}
