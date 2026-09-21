import { NextResponse } from "next/server";
import { getSessionUser } from "@/adapters/auth";
import { prisma } from "@/adapters/db/client";
import { setThemeCookie } from "@/adapters/theme-cookie";
import { isTheme } from "@/domain/theme";

export const dynamic = "force-dynamic";

// Sets the theme cookie for every caller, and the account only when signed in.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    theme?: unknown;
  } | null;
  const theme = body?.theme;
  if (!isTheme(theme)) {
    return NextResponse.json(
      { error: "theme must be one of: light, dark" },
      { status: 400 },
    );
  }

  const user = await getSessionUser();
  if (user) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { theme },
      });
      // Opaque ids only — the audit row records that the theme changed, not
      // what it changed to.
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          entity: "User",
          entityId: user.id,
          action: "theme_changed",
        },
      });
    });
  }
  await setThemeCookie(theme);

  return NextResponse.json({ ok: true });
}
