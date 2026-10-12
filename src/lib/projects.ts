import type { Prisma } from "@prisma/client";
import { db } from "./db";

/** Distinct projects used on jobs so far, for suggestions and filters. */
export async function projectNames(where: Prisma.JobWhereInput = {}): Promise<string[]> {
  const rows = await db.job.findMany({ where: { ...where, project: { not: null } }, select: { project: true }, distinct: ["project"], orderBy: { project: "asc" } });
  return rows.map((r) => r.project!).filter(Boolean);
}
