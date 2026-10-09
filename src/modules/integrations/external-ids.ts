import { and, eq } from "drizzle-orm";
import type { ImportContext } from "@/core/imports/context";
import { externalIds, type IMPORT_SOURCES } from "./schema";

type Source = (typeof IMPORT_SOURCES)[number];

export async function findByExternalId(ctx: ImportContext, source: Source, entity: string, externalId: string): Promise<string | null> {
  const [row] = await ctx.db
    .select({ entityId: externalIds.entityId })
    .from(externalIds)
    .where(and(eq(externalIds.schoolId, ctx.schoolId), eq(externalIds.source, source), eq(externalIds.entity, entity), eq(externalIds.externalId, externalId)));
  return row?.entityId ?? null;
}

export async function rememberExternalId(ctx: ImportContext, source: Source, entity: string, externalId: string, entityId: string) {
  await ctx.db
    .insert(externalIds)
    .values({ schoolId: ctx.schoolId, createdBy: ctx.actorUserId, source, entity, externalId, entityId })
    .onConflictDoNothing();
}
