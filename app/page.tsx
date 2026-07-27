import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";

export default async function RootPage() {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role === "customer") redirect("/home");
  if (user.role === "partner") redirect("/partner/dashboard");
  if (user.role === "admin") redirect("/admin/dashboard");

  redirect("/login");
}
