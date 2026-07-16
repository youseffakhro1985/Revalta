"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, UserRound, XCircle } from "lucide-react";

type UserOption = { id: string; name: string | null; email: string; role: string };
type Assignment = {
  notificationKey?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  status?: string;
  deadline?: string | null;
  note?: string | null;
  updatedAt?: string;
};
type AssignmentData = { users: UserOption[]; assignments: Record<string, Assignment> };

let sharedRequest: Promise<AssignmentData> | null = null;
function loadAssignments() {
  if (!sharedRequest) {
    sharedRequest = fetch("/api/notifications/service-center/assignments", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Kunde inte hämta ansvarstilldelningar");
        return body as AssignmentData;
      })
      .catch((error) => {
        sharedRequest = null;
        throw error;
      });
  }
  return sharedRequest;
}

const statusLabels: Record<string, string> = {
  assigned: "Tilldelad",
  in_progress: "Pågår",
  completed: "Slutförd",
  blocked: "Blockerad",
};

export function NotificationAssignment({ notificationKey }: { notificationKey: string }) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [status, setStatus] = useState("assigned");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let active = true;
    void loadAssignments().then((data) => {
      if (!active) return;
      setUsers(data.users);
      const current = data.assignments[notificationKey] || null;
      setAssignment(current);
      setAssigneeId(current?.assigneeId || "");
      setStatus(current?.status || "assigned");
      setDeadline(current?.deadline ? current.deadline.slice(0, 10) : "");
      setNote(current?.note || "");
    }).catch((value) => {
      if (active) setError(value instanceof Error ? value.message : "Kunde inte hämta ansvarstilldelningen");
    });
    return () => { active = false; };
  }, [notificationKey]);

  const selectedUser = useMemo(() => users.find((item) => item.id === assigneeId), [assigneeId, users]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/notifications/service-center/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationKey, assigneeId: assigneeId || null, status, deadline: deadline || null, note }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Kunde inte spara ansvarstilldelningen");
      setAssignment(body.assignment);
      sharedRequest = null;
      setOpen(false);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Kunde inte spara ansvarstilldelningen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-[210px]">
      <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-sand-200 bg-white px-3 py-2 text-left text-sm font-semibold text-ink-700 hover:bg-sand-50">
        <span className="inline-flex min-w-0 items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-petroleum-700" /><span className="truncate">{assignment?.assigneeName || "Tilldela ansvarig"}</span></span>
        {assignment?.status ? <span className="rounded-full bg-petroleum-50 px-2 py-0.5 text-[10px] font-semibold text-petroleum-800">{statusLabels[assignment.status] || assignment.status}</span> : null}
      </button>

      {assignment?.deadline && !open ? <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-ink-500"><CalendarClock className="h-3.5 w-3.5" /> Deadline {new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(assignment.deadline))}</p> : null}

      {open ? (
        <div className="mt-2 w-full rounded-xl border border-sand-200 bg-white p-3 shadow-premium-sm">
          <div className="grid gap-3">
            <label className="grid gap-1 text-xs font-semibold text-ink-600">Ansvarig
              <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none focus:border-petroleum-400">
                <option value="">Ingen ansvarig</option>
                {users.map((item) => <option key={item.id} value={item.id}>{item.name || item.email} · {item.role}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-ink-600">Status
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none focus:border-petroleum-400">
                <option value="assigned">Tilldelad</option><option value="in_progress">Pågår</option><option value="completed">Slutförd</option><option value="blocked">Blockerad</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-ink-600">Deadline
              <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-800 outline-none focus:border-petroleum-400" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-ink-600">Kommentar
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} placeholder="Nästa åtgärd eller viktig information" className="resize-none rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-800 outline-none focus:border-petroleum-400" />
            </label>
            {selectedUser ? <p className="text-[11px] text-ink-500">Tilldelas {selectedUser.name || selectedUser.email}.</p> : null}
            {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}
            <div className="flex gap-2">
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-petroleum-800 px-3 py-2 text-sm font-semibold text-white hover:bg-petroleum-900 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> {saving ? "Sparar…" : "Spara"}</button>
              <button type="button" onClick={() => setOpen(false)} disabled={saving} className="inline-flex items-center justify-center rounded-lg border border-sand-200 px-3 py-2 text-ink-600 hover:bg-sand-50"><XCircle className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
