import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { RegisterForm } from "@/components/auth/AuthForms";

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/");
  return <RegisterForm />;
}
