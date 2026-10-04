import Link from "next/link";
import { PRIMARY } from "@/components/button-classes";
import { ErrorPage } from "@/components/error-page";

/**
 * App-wide 404, also rendered by every notFound() call; a missing page and
 * a page the viewer may not see look the same.
 */
export default function NotFound() {
  return (
    <ErrorPage heading="there's been a CAT-astrophic failure." errorLine="error 404">
      <Link href="/" className={`${PRIMARY} no-underline`}>
        Back to the home page
      </Link>
    </ErrorPage>
  );
}
