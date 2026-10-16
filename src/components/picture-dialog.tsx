"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  closeImageDialog$,
  imageDialogState$,
  insertImage$,
  saveImage$,
  useCellValue,
  usePublisher,
  type EditingImageDialogState,
  type NewImageDialogState,
} from "@mdxeditor/editor";
import { SECONDARY_SM } from "@/components/button-classes";
import { UPLOAD_STAGE_WORDS, uploadPicture, type UploadStage } from "@/components/picture-upload";
import { Segmented } from "@/components/segmented";
import { IMAGE_TYPES, pictureSize, sizeTitle, type PictureSize } from "@/domain/images";

/** The id of the event whose description the editor holds. */
export const PictureEventContext = createContext("");

const FIELD = "rounded border border-edge-strong bg-field px-2 py-1 text-sm disabled:opacity-50";

const SIZE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

function PictureDialogBody({
  state,
  titleId,
  busyRef,
}: {
  state: NewImageDialogState | EditingImageDialogState;
  titleId: string;
  busyRef: RefObject<boolean>;
}) {
  const eventId = useContext(PictureEventContext);
  const insertImage = usePublisher(insertImage$);
  const saveImage = usePublisher(saveImage$);
  const closeDialog = usePublisher(closeImageDialog$);
  const editing = state.type === "editing";
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState(editing ? (state.initialValues.altText ?? "") : "");
  const [size, setSize] = useState<PictureSize>(
    editing ? pictureSize(state.initialValues.title) : "large",
  );
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = stage !== null;
  const ready = editing || file !== null;
  const id = useId();

  useEffect(() => {
    busyRef.current = busy;
  }, [busy, busyRef]);

  async function submit() {
    if (busy || !ready) return;
    if (state.type === "editing") {
      saveImage({ ...state.initialValues, altText: description.trim(), title: sizeTitle(size) });
      return;
    }
    if (!file) return;
    setError(null);
    const outcome = await uploadPicture(eventId, file, setStage);
    setStage(null);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    insertImage({ src: outcome.src, altText: description.trim(), title: sizeTitle(size) });
    closeDialog();
  }

  // Enter in the description inserts, as a form would.
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void submit();
  }

  return (
    <>
      <h2 id={titleId} className="font-heading text-base font-semibold">
        {editing ? "Picture description and size" : "Add a picture"}
      </h2>
      {!editing && (
        <div>
          <label htmlFor={`${id}-file`} className="mb-1 block text-muted">
            Picture
          </label>
          <input
            id={`${id}-file`}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            disabled={busy}
            aria-describedby={`${id}-file-hint`}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
            className="block w-full text-sm file:mr-2 file:rounded file:border file:border-edge-strong file:bg-transparent file:px-2 file:py-1 file:text-xs file:font-medium file:text-foreground hover:file:bg-btn-secondary-hover disabled:opacity-50"
          />
          <p id={`${id}-file-hint`} className="mt-1 text-xs text-faint">
            JPEG, PNG, WebP, GIF or AVIF, up to 10 MB.
          </p>
        </div>
      )}
      <div>
        <label htmlFor={`${id}-description`} className="mb-1 block text-muted">
          Description for screen readers (optional)
        </label>
        <input
          id={`${id}-description`}
          type="text"
          value={description}
          disabled={busy}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={onKeyDown}
          className={`w-full ${FIELD}`}
        />
      </div>
      <div>
        <p className="mb-1 text-muted">Size</p>
        <Segmented
          label="Size"
          size="sm"
          options={SIZE_OPTIONS}
          value={size}
          onChange={(value) => setSize(pictureSize(value))}
          disabled={busy}
        />
        {/* Always in the page, so its words are announced; empty and without height when idle. */}
        <p role="status" className={stage ? "mt-3 flex items-center gap-2" : undefined}>
          {stage && (
            <>
              <span aria-hidden="true" className="spinner" />
              {UPLOAD_STAGE_WORDS[stage]}
            </>
          )}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => closeDialog()} className={SECONDARY_SM}>
          Cancel
        </button>
        <button
          type="button"
          aria-disabled={!ready || busy || undefined}
          onClick={() => void submit()}
          className={`${SECONDARY_SM} aria-disabled:opacity-50`}
        >
          {editing ? "Save" : "Insert"}
        </button>
      </div>
    </>
  );
}

/** The picture dialog: a modal over the page while MDXEditor's image dialog state is active. */
export function PictureDialog() {
  const state = useCellValue(imageDialogState$);
  const closeDialog = usePublisher(closeImageDialog$);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const titleId = useId();
  const open = state.type !== "inactive";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Outside the editor's form, so Enter here never submits the description.
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (busyRef.current) event.preventDefault();
      }}
      onClose={() => {
        if (open) closeDialog();
      }}
      className="picture-dialog flex-col gap-3 rounded-card border border-edge-strong bg-surface-card p-4 text-sm text-foreground open:flex"
    >
      {state.type !== "inactive" && (
        <PictureDialogBody state={state} titleId={titleId} busyRef={busyRef} />
      )}
    </dialog>,
    document.body,
  );
}
