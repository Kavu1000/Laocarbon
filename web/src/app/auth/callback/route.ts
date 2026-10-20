import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Target of the email-confirmation link: trades the one-time code for a session cookie.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/profile";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/profile";

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=confirm", url.origin));
}
