import { authReason } from "@/lib/auth/messages";
import LoginShell from "@/components/auth/login-shell";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "邮箱登录 · FRAMEWORK Studio",
  robots: { index: false, follow: false },
};
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const reason =
    typeof query.reason === "string" ? authReason(query.reason) : undefined;
  return <LoginShell reason={reason} />;
}
