import Shell from "@/components/Shell";
import { requireUser } from "@/lib/auth";

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <Shell user={user}>{children}</Shell>;
}
