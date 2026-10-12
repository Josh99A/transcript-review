import { cookies } from "next/headers";
import { earningsFor } from "./pay";

type Sortable = {
  createdAt: Date;
  updatedAt: Date;
  assignedAt: Date | null;
  submittedAt: Date | null;
  approvedAt?: Date | null;
  deadline: Date | null;
  durationSeconds: number;
  ratePerHour: number | null;
  title: string;
};

const time = (d: Date | null | undefined) => (d ? d.getTime() : null);
const pay = (j: Sortable) => earningsFor(j.durationSeconds, j.ratePerHour ?? undefined);

export const SORTS = {
  updated: { label: "Recently updated", key: (j: Sortable) => time(j.updatedAt), dir: -1 },
  posted_new: { label: "Uploaded: newest", key: (j: Sortable) => time(j.createdAt), dir: -1 },
  posted_old: { label: "Uploaded: oldest", key: (j: Sortable) => time(j.createdAt), dir: 1 },
  assigned_new: { label: "Assigned: newest", key: (j: Sortable) => time(j.assignedAt), dir: -1 },
  assigned_old: { label: "Assigned: oldest", key: (j: Sortable) => time(j.assignedAt), dir: 1 },
  submitted_new: { label: "Submitted: newest", key: (j: Sortable) => time(j.submittedAt), dir: -1 },
  submitted_old: { label: "Submitted: oldest", key: (j: Sortable) => time(j.submittedAt), dir: 1 },
  approved_new: { label: "Approved: newest", key: (j: Sortable) => time(j.approvedAt), dir: -1 },
  approved_old: { label: "Approved: oldest", key: (j: Sortable) => time(j.approvedAt), dir: 1 },
  deadline: { label: "Deadline: soonest", key: (j: Sortable) => time(j.deadline), dir: 1 },
  longest: { label: "Length: longest", key: (j: Sortable) => j.durationSeconds, dir: -1 },
  shortest: { label: "Length: shortest", key: (j: Sortable) => j.durationSeconds, dir: 1 },
  pay_high: { label: "Pay: highest", key: pay, dir: -1 },
  pay_low: { label: "Pay: lowest", key: pay, dir: 1 },
  title: { label: "Title: A to Z", key: (j: Sortable) => j.title.toLowerCase(), dir: 1 },
} as const;

export type SortKey = keyof typeof SORTS;

/** Sorts jobs in place by one of the shared orders. Jobs missing the date go last either way. */
export function sortJobs<T extends Sortable>(jobs: T[], sort: SortKey): T[] {
  const { key, dir } = SORTS[sort];
  return jobs.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === y) return b.createdAt.getTime() - a.createdAt.getTime();
    if (x === null) return 1;
    if (y === null) return -1;
    return (x < y ? -1 : 1) * dir;
  });
}

/**
 * The sort to use on a page: from the address if present, otherwise the one the person last picked
 * on that page (remembered in a cookie by SortSelect), otherwise the page's default.
 */
export async function pickSort(page: string, fromUrl: string | undefined, allowed: readonly SortKey[], fallback: SortKey): Promise<SortKey> {
  const ok = (s?: string): s is SortKey => !!s && (allowed as readonly string[]).includes(s);
  if (ok(fromUrl)) return fromUrl;
  const saved = (await cookies()).get(`sort-${page}`)?.value;
  return ok(saved) ? saved : fallback;
}

export const sortOptions = (allowed: readonly SortKey[]) => allowed.map((value) => ({ value, label: SORTS[value].label }));
