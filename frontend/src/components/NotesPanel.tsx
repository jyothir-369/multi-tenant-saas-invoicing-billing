"use client";
import { useState, useCallback } from "react";
import { api, formatMoney } from "../lib/api";
import type { CustomerNote } from "../types";

export default function NotesPanel({
  customerId,
  notes: initial,
  onRefresh,
}: {
  customerId: string;
  notes: CustomerNote[];
  onRefresh: () => void;
}) {
  const [notes, setNotes] = useState<CustomerNote[]>(initial);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const refresh = useCallback(async () => {
    const data = await api<CustomerNote[]>(`/customers/${customerId}/notes`);
    setNotes(data);
    onRefresh();
  }, [customerId, onRefresh]);

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api(`/customers/${customerId}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: trimmed }),
      });
      setText("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function updateNote(id: string) {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api(`/customers/${customerId}/notes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ content: trimmed }),
      });
      setEditingId(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(id: string) {
    if (!window.confirm("Delete this note?")) return;
    await api(`/customers/${customerId}/notes/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div>
      <h3 className="font-bold mb-3">Notes</h3>
      <div className="flex gap-2 mb-4">
        <textarea
          className="flex-1 border rounded p-2 text-sm"
          rows={3}
          placeholder="Add a note..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="primaryButton self-end" onClick={add} disabled={saving || !text.trim()}>
          Add note
        </button>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-gray-500">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="bg-gray-50 rounded p-3 border">
              {editingId === n.id ? (
                <>
                  <textarea
                    className="w-full border rounded p-2 text-sm mb-2"
                    rows={3}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button className="primaryButton text-xs px-3 py-1" onClick={() => updateNote(n.id)} disabled={saving}>
                      Save
                    </button>
                    <button className="text-xs px-3 py-1" onClick={() => { setEditingId(null); setEditText(""); }}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm">{n.content}</p>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(n.createdAt).toLocaleString()} · {n.user?.email || "User"}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button className="text-xs text-teal-700" onClick={() => { setEditingId(n.id); setEditText(n.content); }}>
                      Edit
                    </button>
                    <button className="text-xs text-red-600" onClick={() => deleteNote(n.id)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
