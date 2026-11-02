import { redirect } from "next/navigation";
import { parseAuthCallback } from "@/lib/auth/parameters";
import ConfirmEmail from "@/components/auth/confirm-email";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "确认登录 · aikari",
  robots: { index: false, follow: false },
};
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value !== undefined) params.set(key, value);
  }
  const input = parseAuthCallback(params);
  if (input.kind !== "hash") redirect("/auth/login?reason=invalid_request");
  return <ConfirmEmail tokenHash={input.tokenHash} type={input.type} />;
}
