import { imageStatus, requestImageUpload } from "@/app/e/[eventId]/manage/image-actions";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, READY_WAIT_MS, refusalMessage } from "@/domain/images";

export type UploadStage = "uploading" | "preparing";

/** What a status line says at each stage of an upload. */
export const UPLOAD_STAGE_WORDS: Record<UploadStage, string> = {
  uploading: "Uploading…",
  preparing: "Getting it ready…",
};

export type UploadOutcome = { ok: true; src: string } | { ok: false; message: string };

const POLL_MS = 1000;

const refuse = (reason: string): UploadOutcome => ({ ok: false, message: refusalMessage(reason) });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Uploads a picture for the event and waits until it is ready; never throws. */
export async function uploadPicture(
  eventId: string,
  file: File,
  onStage: (stage: UploadStage) => void = () => {},
): Promise<UploadOutcome> {
  // Checked here first so a file the server would refuse is never sent.
  if (!IMAGE_TYPES.includes(file.type)) return refuse("type");
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return refuse("size");

  onStage("uploading");
  try {
    const request = await requestImageUpload({ eventId, contentType: file.type, size: file.size });
    if (!request.ok) return { ok: false, message: request.message };
    // The storage reads the form's fields before the file, so the file goes last.
    const body = new FormData();
    for (const [name, value] of Object.entries(request.upload.fields)) body.append(name, value);
    body.append("file", file);
    const response = await fetch(request.upload.url, { method: "POST", body });
    if (!response.ok) return refuse("unavailable");

    onStage("preparing");
    const deadline = Date.now() + READY_WAIT_MS;
    while (Date.now() < deadline) {
      const status = await imageStatus({ eventId, imageId: request.imageId });
      if (status.state === "ready") return { ok: true, src: `img:${request.imageId}` };
      if (status.state === "refused") return { ok: false, message: status.message };
      await wait(POLL_MS);
    }
    return refuse("timed-out");
  } catch {
    return refuse("unavailable");
  }
}
