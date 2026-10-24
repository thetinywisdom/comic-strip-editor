import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ADMIN_EMAIL } from "@/components/AuthGate";

type Role = "admin" | "user";
type Entry = { email: string; role: Role };

const AccessDialog = ({ trigger }: { trigger: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("allowed_emails")
      .select("email, role")
      .order("email");
    if (error) toast.error("Could not load the access list");
    else setEntries((data ?? []) as Entry[]);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = value.trim().toLowerCase();
    if (!email) return;
    setBusy(true);
    const { error } = await supabase
      .from("allowed_emails")
      .insert({ email, role: "user" });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setValue("");
    load();
  };

  const setRole = async (email: string, role: Role) => {
    const { error } = await supabase
      .from("allowed_emails")
      .update({ role })
      .eq("email", email);
    if (error) toast.error(error.message);
    else load();
  };

  const remove = async (email: string) => {
    const { error } = await supabase.from("allowed_emails").delete().eq("email", email);
    if (error) toast.error(error.message);
    else load();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Access</DialogTitle>
        </DialogHeader>
        <form onSubmit={add} className="flex gap-2">
          <Input
            type="email"
            placeholder="name@example.com"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" disabled={busy}>
            Add
          </Button>
        </form>
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li
              key={entry.email}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <span className="truncate flex-1">{entry.email}</span>
              {entry.email === ADMIN_EMAIL ? (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Admin
                </span>
              ) : (
                <>
                  <Select
                    value={entry.role}
                    onValueChange={(v) => setRole(entry.email, v as Role)}
                  >
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    onClick={() => remove(entry.email)}
                    className="text-muted-foreground hover:text-destructive transition"
                    aria-label={`Remove ${entry.email}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Users can create and edit projects. Admins can also delete projects and manage access.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default AccessDialog;
