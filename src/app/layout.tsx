import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSessionUser } from "@/adapters/auth";

export const metadata: Metadata = {
  title: "catherder",
  description: "TTRPG session planning",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {user && (
          <header className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <Link href="/">catherder</Link>
            <Link href="/availability">Availability</Link>
            <span className="ml-auto flex items-center gap-4">
              <span>{user.displayName}</span>
              <a href="/logout">Log out</a>
            </span>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
