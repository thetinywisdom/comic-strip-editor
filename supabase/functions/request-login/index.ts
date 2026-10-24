import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ADMIN_EMAIL = "brian@thetinywisdom.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { email, redirectTo } = await req.json();
    const address = String(email ?? "").trim().toLowerCase();
    if (!address || !address.includes("@")) return json({ error: "Invalid email." }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let allowed = address === ADMIN_EMAIL;
    if (!allowed) {
      const { data, error } = await admin
        .from("allowed_emails")
        .select("email")
        .eq("email", address)
        .maybeSingle();
      if (error) return json({ error: "Could not verify access." }, 500);
      allowed = !!data;
    }

    if (!allowed) {
      return json({ error: "This email doesn't have access to this tool." }, 403);
    }

    // Make sure the account exists (public sign-ups are disabled).
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) {
      console.error("listUsers failed", listErr.message);
      return json({ error: "Sign-in service is temporarily unavailable. Please try again in a minute." }, 503);
    }
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === address);
    if (!existing) {
      const { error: createErr } = await admin.auth.admin.createUser({
        email: address,
        email_confirm: true,
      });
      if (createErr) return json({ error: createErr.message }, 500);
    }

    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { error: otpErr } = await anon.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
    });
    if (otpErr) return json({ error: otpErr.message }, 400);

    return json({ ok: true });
  } catch (_e) {
    return json({ error: "Unexpected error." }, 500);
  }
});
