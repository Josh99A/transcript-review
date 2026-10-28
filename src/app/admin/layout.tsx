import Shell from "@/components/Shell";
import { requireAdmin } from "@/lib/auth";
import { UploadsProvider } from "./Uploads";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <UploadsProvider>
      <Shell user={user}>{children}</Shell>
    </UploadsProvider>
  );
}
