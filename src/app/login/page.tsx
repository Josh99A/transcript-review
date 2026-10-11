import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
        <LoginForm />
      </div>
    </div>
  );
}
