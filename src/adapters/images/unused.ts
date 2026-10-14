import { prisma } from "@/adapters/db/client";
import { getImageStorage } from "@/adapters/images/storage";
import { referencedImageIds, UNUSED_IMAGE_GRACE_MS } from "@/domain/images";

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

/** Removes the event's pictures older than the grace period that the saved description no longer shows; never throws. */
export async function removeUnusedImages(eventId: string, description: string | null): Promise<void> {
  try {
    const used = referencedImageIds(description ?? "");
    const rows = await prisma.eventImage.findMany({
      where: { eventId, createdAt: { lt: new Date(Date.now() - UNUSED_IMAGE_GRACE_MS) } },
      select: { id: true },
    });
    const unused = rows.filter((row) => !used.has(row.id));
    if (unused.length === 0) return;
    const storage = getImageStorage();
    for (const { id } of unused) {
      try {
        // The file goes first, so a failed removal leaves the row for the next save to retry.
        await storage.remove(eventId, id);
        await prisma.eventImage.delete({ where: { id } });
      } catch (error) {
        console.warn(`image cleanup failed event=${eventId} image=${id} error=${errorName(error)}`);
      }
    }
  } catch (error) {
    console.warn(`image cleanup failed event=${eventId} error=${errorName(error)}`);
  }
}
