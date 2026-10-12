import SideNav from "./SideNav";

type Props = {
  user: { name: string; email: string; role: "ADMIN" | "USER" | "REFERRER" };
  children: React.ReactNode;
};

export default function Shell({ user, children }: Props) {
  return (
    <div className="min-h-screen lg:pl-64">
      <SideNav user={user} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
