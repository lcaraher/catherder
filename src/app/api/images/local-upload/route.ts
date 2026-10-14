import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { handleUpload, parsePendingKey } from "@/adapters/images/resize-handler";
import { getImageStorage, pendingKey, type ImageStorage } from "@/adapters/images/storage";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/domain/images";

export const dynamic = "force-dynamic";

const notFound = () => new Response(null, { status: 404 });
const badRequest = () => new Response(null, { status: 400 });

function localStorageOrNull(): Extract<ImageStorage, { kind: "local" }> | null {
  try {
    const storage = getImageStorage();
    return storage.kind === "local" ? storage : null;
  } catch {
    return null;
  }
}

// The local stand-in for posting to the bucket: stores the upload, then resizes it at once as the bucket's function would.
export async function POST(request: Request) {
  const storage = localStorageOrNull();
  if (!storage) return notFound();
  const user = await getSessionUser();
  if (!user) return badRequest();

  const form = await request.formData().catch(() => null);
  const key = form?.get("key");
  const contentType = form?.get("Content-Type");
  const file = form?.get("file");
  if (typeof key !== "string" || typeof contentType !== "string" || !(file instanceof File)) {
    return badRequest();
  }
  const ids = parsePendingKey(key);
  if (!ids || key !== pendingKey(ids.eventId, ids.imageId)) return badRequest();
  const image = await prisma.eventImage.findFirst({
    where: { id: ids.imageId, eventId: ids.eventId, uploaderUserId: user.id },
  });
  if (!image) return badRequest();
  if (!IMAGE_TYPES.includes(contentType) || file.type !== contentType) return badRequest();
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return badRequest();

  await storage.store.put(key, Buffer.from(await file.arrayBuffer()), contentType);
  await handleUpload(key, storage.store, console.log);
  return new Response(null, { status: 204 });
}
