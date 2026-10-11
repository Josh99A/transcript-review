import Shell from "@/components/Shell";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <Shell user={user}>{children}</Shell>;
}
