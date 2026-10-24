import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import logotypeAsset from "@/assets/logotype.svg.asset.json";

export const ADMIN_EMAIL = "brian@thetinywisdom.com";

const NO_PERSIST_KEY = "tw_no_persist";
const TAB_KEY = "tw_tab_active";

const AuthGate = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    // If the last sign-in opted out of "keep me signed in", drop the session
    // when the browser is reopened in a fresh tab/session.
    const enforce = async () => {
      if (
        localStorage.getItem(NO_PERSIST_KEY) === "1" &&
        sessionStorage.getItem(TAB_KEY) !== "1"
      ) {
        await supabase.auth.signOut();
      }
      sessionStorage.setItem(TAB_KEY, "1");

      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
        setSession(s);
        setChecking(false);
      });
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setChecking(false);
      return () => sub.subscription.unsubscribe();
    };
    let cleanup: (() => void) | undefined;
    enforce().then((c) => {
      cleanup = c;
    });
    return () => cleanup?.();
  }, []);


  useEffect(() => {
    if (!session) {
      setAllowed(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.rpc("is_allowed");
      if (cancelled) return;
      setAllowed(!err && data === true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (keepSignedIn) localStorage.removeItem(NO_PERSIST_KEY);
    else localStorage.setItem(NO_PERSIST_KEY, "1");

    const { data, error: err } = await supabase.functions.invoke("request-login", {
      body: {
        email: email.trim().toLowerCase(),
        redirectTo: window.location.origin,
      },
    });
    setBusy(false);
    const message = (data as { error?: string } | null)?.error;
    if (message) setError(message);
    else if (err) setError("This email doesn't have access to this tool.");
    else setStep("code");
  };

  if (checking) {
    return <div className="min-h-screen bg-background" />;
  }

  if (session && allowed === null) {
    return <div className="min-h-screen bg-background" />;
  }

  if (session && allowed === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-xs space-y-4 text-center">
          <img src={logotypeAsset.url} alt="The Tiny Wisdom" className="h-8 w-auto mx-auto" />
          <p className="text-sm text-muted-foreground">
            {session.user.email} does not have access to this tool.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              setStep("email");
            }}
          >
            Use another email
          </Button>
        </div>
      </div>
    );
  }

  if (session && allowed) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      {step === "email" ? (
        <form onSubmit={sendCode} className="w-full max-w-xs space-y-4 text-center">
          <img src={logotypeAsset.url} alt="The Tiny Wisdom" className="h-8 w-auto mx-auto" />
          <p className="text-xs text-muted-foreground">
            Enter your email and we'll send you a sign-in link.
          </p>

          <Input
            type="email"
            required
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="keep-signed-in"
              checked={keepSignedIn}
              onCheckedChange={(v) => setKeepSignedIn(v === true)}
            />
            <Label htmlFor="keep-signed-in" className="text-xs font-normal text-muted-foreground">
              Keep me signed in
            </Label>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Sending…" : "Send sign-in link"}
          </Button>
        </form>
      ) : (
        <div className="w-full max-w-xs space-y-4 text-center">
          <img src={logotypeAsset.url} alt="The Tiny Wisdom" className="h-8 w-auto mx-auto" />
          <p className="text-xs text-muted-foreground">
            Check {email} and click the sign-in link to continue.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            variant="ghost"
            className="w-full text-xs"
            disabled={busy}
            onClick={() => {
              setStep("email");
              setError(null);
            }}
          >
            Use a different email
          </Button>
        </div>
      )}
    </div>
  );
};

export default AuthGate;
