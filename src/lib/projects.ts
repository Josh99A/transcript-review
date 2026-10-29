import type { Prisma } from "@prisma/client";
import { db } from "./db";

/** Encoded filter values keep a group literally named "Ungrouped" distinct from no group. */
export function projectFilter(group?: string): Prisma.JobWhereInput {
  if (group === "ungrouped") return { project: null };
  if (group?.startsWith("project:")) return { project: group.slice("project:".length) };
  return {};
}

/** Distinct projects used on jobs so far, for suggestions and filters. */
export async function projectNames(where: Prisma.JobWhereInput = {}): Promise<string[]> {
  const rows = await db.job.findMany({ where: { ...where, project: { not: null } }, select: { project: true }, distinct: ["project"], orderBy: { project: "asc" } });
  return rows.map((r) => r.project!).filter(Boolean);
}
