import { notFound } from "next/navigation";
import { isDevIssuerEnabled } from "@/adapters/auth";
import { Logo } from "@/components/logo";
import { Wordmark } from "@/components/wordmark";

export const dynamic = "force-dynamic";

/** The link preview image, rendered by scripts/render-preview-image.mts; a 404 outside development. */
export default function DevPreviewImagePage() {
  if (!isDevIssuerEnabled()) notFound();
  return (
    <main className="flex flex-1 items-center-safe justify-center-safe">
      <div
        data-preview-image
        data-theme="aurora"
        className="preview-frame header-glow flex items-center justify-center bg-surface"
      >
        <div className="preview-card accent-gradient-border flex flex-col items-center gap-10 text-foreground">
          <Logo size={180} />
          <h1 className="preview-wordmark font-wordmark font-extrabold text-foreground">
            <Wordmark />
          </h1>
        </div>
      </div>
    </main>
  );
}
