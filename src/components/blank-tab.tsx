import { Pane } from "@/components/pane";
import { PixelCat } from "@/components/pixel-cat";

/** A tab with nothing in it yet: its heading, the puzzled cat and two lines from the page. */
export function BlankTab({ heading, lines }: { heading: string; lines: [string, string] }) {
  return (
    <Pane>
      <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">{heading}</h2>
      <div className="flex flex-col items-center gap-4 pt-4 pb-2 text-center">
        <PixelCat mood="puzzled" className="h-31.5 w-22.5 text-btn-primary" />
        <p className="text-muted">
          {lines[0]}
          <br />
          {lines[1]}
        </p>
      </div>
    </Pane>
  );
}
