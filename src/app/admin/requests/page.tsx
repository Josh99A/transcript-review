import { redirect } from "next/navigation";

// Requests no longer wait for an admin; older notifications and emails still link here.
export default function RequestsPage() {
  redirect("/admin");
}
