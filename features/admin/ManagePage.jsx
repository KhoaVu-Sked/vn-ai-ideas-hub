"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import { field } from "./manage/styles";
import { MANAGE_SECTIONS } from "./sections";
import DeleteRequestsSection from "./manage/DeleteRequestsSection";
import MergeRequestsSection from "./manage/MergeRequestsSection";
import FeedbackSection from "./manage/FeedbackSection";
import FormFieldsSection from "./manage/FormFieldsSection";
import SettingsSection from "./manage/SettingsSection";
import TagsSection from "./manage/TagsSection";
import UsersSection from "./manage/UsersSection";

// useSearchParams() needs a Suspense boundary during prerender.
export default function ManagePageWrapper() {
  return <Suspense fallback={<Loading label="Loading" />}><ManagePage /></Suspense>;
}

function ManagePage() {
  const { user } = useSession();
  // undefined while the session loads, null for a non-admin.
  const me = user === undefined ? undefined : (user?.role === "admin" ? user : null);
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [creating, setCreating] = useState({ username: "", email: "", name: "", password: "", role: "member" });
  const [feedback, setFeedback] = useState([]);
  const [fields, setFields] = useState([]);
  const [newField, setNewField] = useState({ label: "", type: "text", options: "", required: false });
  const [timeFrames, setTimeFrames] = useState([]);
  const [newTimeFrame, setNewTimeFrame] = useState("");
  const [deleteRequests, setDeleteRequests] = useState([]);
  const [mergeRequests, setMergeRequests] = useState([]);
  const [emailOn, setEmailOn] = useState(true);
  const searchParams = useSearchParams();
  const [view, setView] = useState("tags");
  // Deep-link from the header's hover menu: /manage?section=users
  useEffect(() => { const s = searchParams.get("section"); if (s) setView(s); }, [searchParams]);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState({});
  const [ready, setReady] = useState(false);   // data loaded — avoids an empty-state flash

  const withText = (fs) => (fs || []).filter((x) => !x.archived).map((x) => ({ ...x, optionsText: (x.options || []).join(", ") }));

  const load = useCallback(async () => {
    setErr("");
    try {
      // One parallel wave — six sequential round trips made this page crawl.
      const [t, a, fb, ff, tf, dr, st, mq] = await Promise.all([
        api("/api/tags"), api("/api/accounts"), api("/api/feedback"),
        api("/api/form-fields"), api("/api/time-frames"), api("/api/ideas/delete-requests"),
        api("/api/settings"),
        // Tolerated separately: if merge_requests hasn't been created yet, the
        // whole page used to come back empty — no tags, no accounts, no fields —
        // behind one error banner.
        api("/api/merge-requests").catch(() => ({ requests: [] })),
      ]);
      setEmailOn(st.settings.email_notifications);
      setTags(t.tags);
      setAccounts(a.accounts);
      setFeedback(fb.feedback);
      setFields(withText(ff.fields));
      setTimeFrames(tf.timeFrames);
      setDeleteRequests(dr.requests);
      setMergeRequests(mq.requests || []);
    } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, []);

  useEffect(() => { if (me) load(); }, [me, load]);

  // Pick up other admins' changes when you come back to the tab.
  useRevalidateOnFocus(() => { if (me) load(); }, { enabled: Object.values(dirty).every((v) => !v) });

  const run = async (fn, okMsg, revert) => { setErr(""); try { await fn(); if (okMsg) { setToast(okMsg); setTimeout(() => setToast(""), 2500); } } catch (e) { revert?.(); setErr(e.message); } };

  const addTag = () => { const n = newTag.trim(); if (!n) return; run(async () => { const { tags: t } = await api("/api/tags", { method: "POST", body: JSON.stringify({ name: n }) }); setTags(t); setNewTag(""); }); };
  const delTag = (name) => { if (!confirm(`Delete tag "${name}"? It will be removed from any ideas using it.`)) return; run(async () => { const { tags: t } = await api("/api/tags", { method: "DELETE", body: JSON.stringify({ name }) }); setTags(t); }); };
  const setColor = (name, color) => run(async () => { const { tags: t } = await api("/api/tags", { method: "PATCH", body: JSON.stringify({ name, color }) }); setTags(t); });

  const setAcct = (id, k, v) => { setAccounts((as) => as.map((a) => (a.id === id ? { ...a, [k]: v } : a))); setDirty((d) => ({ ...d, [id]: true })); };
  const saveAllAccounts = () => {
    const ids = Object.keys(dirty).filter((id) => dirty[id]);
    if (ids.length === 0) return;
    run(async () => {
      for (const id of ids) {
        const a = accounts.find((x) => x.id === id);
        if (!a) continue;
        const { account } = await api(`/api/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ username: a.username, email: a.email, name: a.name, role: a.role }) });
        setAccounts((as) => as.map((x) => (x.id === a.id ? { ...x, ...account } : x)));
      }
      setDirty({});
    }, `Saved ${ids.length} account${ids.length === 1 ? "" : "s"}.`);
  };
  const resetPw = (a) => { const pw = prompt(`New password for ${a.username}:`); if (!pw) return; run(() => api(`/api/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ username: a.username, email: a.email, name: a.name, role: a.role, password: pw }) }), `Password reset for ${a.username}.`); };
  const delAcct = (a) => { if (!confirm(`Delete account "${a.username}"? This removes their memberships, likes, and requests.`)) return; run(async () => { await api(`/api/accounts/${a.id}`, { method: "DELETE" }); setAccounts((as) => as.filter((x) => x.id !== a.id)); }); };
  const createAcct = () => run(async () => {
    const { account } = await api("/api/accounts", { method: "POST", body: JSON.stringify(creating) });
    setAccounts((as) => [...as, account]);
    setCreating({ username: "", email: "", name: "", password: "", role: "member" });
  });

  const setFbStatus = (id, status) => run(async () => { await api(`/api/feedback/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setFeedback((fs) => fs.map((f) => (f.id === id ? { ...f, status } : f))); });
  const delFb = (id) => { if (!confirm("Delete this feedback?")) return; run(async () => { await api(`/api/feedback/${id}`, { method: "DELETE" }); setFeedback((fs) => fs.filter((f) => f.id !== id)); }); };

  const setF = (id, k, v) => setFields((fs) => fs.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const addField = () => { const l = newField.label.trim(); if (!l) return; run(async () => {
    const opts = newField.type === "select" ? newField.options.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const { fields: ff } = await api("/api/form-fields", { method: "POST", body: JSON.stringify({ label: l, type: newField.type, required: newField.required, options: opts }) });
    setFields(withText(ff)); setNewField({ label: "", type: "text", options: "", required: false });
  }); };
  const saveField = (f) => run(async () => {
    const opts = f.type === "select" ? (f.optionsText || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
    const { fields: ff } = await api(`/api/form-fields/${f.id}`, { method: "PATCH", body: JSON.stringify({ label: f.label, type: f.type, required: f.required, options: opts }) });
    setFields(withText(ff));
  }, "Field saved.");
  const delField = (f) => { if (!confirm(`Remove field "${f.label}"? It disappears from the form; existing answers on ideas are kept.`)) return; run(async () => { const { fields: ff } = await api(`/api/form-fields/${f.id}`, { method: "DELETE" }); setFields(withText(ff)); }); };

  const moveField = (f, move) => run(async () => { const { fields: ff } = await api(`/api/form-fields/${f.id}`, { method: "PATCH", body: JSON.stringify({ move }) }); setFields(withText(ff)); });

  const addTimeFrame = () => { const n = newTimeFrame.trim(); if (!n) return; run(async () => { const { timeFrames: tf } = await api("/api/time-frames", { method: "POST", body: JSON.stringify({ name: n }) }); setTimeFrames(tf); setNewTimeFrame(""); }); };
  const delTimeFrame = (name) => { if (!confirm(`Remove "${name}" from the options? Ideas already using it keep their value.`)) return; run(async () => { const { timeFrames: tf } = await api("/api/time-frames", { method: "DELETE", body: JSON.stringify({ name }) }); setTimeFrames(tf); }); };

  const dismissReq = (r) => run(async () => { await api(`/api/ideas/${r.id}/delete-request`, { method: "DELETE" }); setDeleteRequests((rs) => rs.filter((x) => x.id !== r.id)); });
  const toggleEmail = () => {
    const next = !emailOn;
    setEmailOn(next);   // optimistic
    run(async () => {
      const { settings } = await api("/api/settings", { method: "PATCH", body: JSON.stringify({ email_notifications: next }) });
      setEmailOn(settings.email_notifications);
    }, next ? "Email notifications are on." : "Email notifications are off.", () => setEmailOn(!next));
  };
  const deleteIdeaNow = (r) => { if (!confirm(`Delete "${r.name}" permanently? This removes its team, likes, requests, and files.`)) return; run(async () => { await api(`/api/ideas/${r.id}`, { method: "DELETE" }); setDeleteRequests((rs) => rs.filter((x) => x.id !== r.id)); }); };
  // Approving is irreversible and discards other people's work, so it asks
  // more loudly than anything else on this page.
  const decideMerge = (r, decision) => {
    if (decision === "approve") {
      const names = r.sources.map((x) => `${x.number} ${x.name}`).join(", ");
      if (!confirm(`Merge ${names} into ${r.main.number} ${r.main.name}?\n\nTheir requests, likes, follows and team will be removed. This cannot be undone.`)) return;
    }
    let reason = "";
    if (decision === "reject") {
      // null means Cancel. Coercing it to "" rejected the request anyway.
      const typed = prompt("Why are you rejecting it? (optional)");
      if (typed === null) return;
      reason = typed;
    }
    run(async () => {
      const res = await api(`/api/merge-requests/${r.id}`, { method: "PATCH", body: JSON.stringify({ decision, reason }) });
      setMergeRequests((rs) => rs.filter((x) => x.id !== r.id));
      if (decision === "approve") await load();      // the board and lists moved
      // Some sources merged and some didn't: the admin is the only person who
      // can tell, so it must not read as a clean success.
      if (res?.message) setErr(res.message);
    }, decision === "approve" ? "Merged." : "Merge request rejected.");
  };

  const openFb = feedback.filter((f) => f.status === "open").length;

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="Manage" />

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined || (me && !ready) ? (
          <Loading label="Loading" />
        ) : me === null ? (
          <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 10, padding: 16 }}>Admins only. <Link href="/" style={{ color: "#c92a2a", fontWeight: 700 }}>Back to board</Link></div>
        ) : (
          <>
            {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 16 }}>{err}</div>}
            {toast && <div style={{ background: "#ebf6ed", border: "1px solid #bde2c5", color: "#2f7a43", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 16, fontWeight: 600 }}>✓ {toast}</div>}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Section</label>
              <select value={view} onChange={(e) => setView(e.target.value)} style={{ ...field, width: 240, fontWeight: 700, fontSize: 13.5, padding: "9px 12px" }}>
                {MANAGE_SECTIONS.map(([v, l]) => <option key={v} value={v}>{l}{v === "feedback" && openFb > 0 ? ` (${openFb})` : ""}{v === "merges" && mergeRequests.length > 0 ? ` (${mergeRequests.length})` : ""}{v === "deletions" && deleteRequests.length > 0 ? ` (${deleteRequests.length})` : ""}</option>)}
              </select>
            </div>

            {/* Tags */}
            {view === 'tags' && <TagsSection addTag={addTag} delTag={delTag} newTag={newTag} setColor={setColor} setNewTag={setNewTag} tags={tags} />}

            {/* Submit form — full design */}
            {view === 'fields' && <FormFieldsSection addField={addField} addTimeFrame={addTimeFrame} delField={delField} delTimeFrame={delTimeFrame} fields={fields} moveField={moveField} newField={newField} newTimeFrame={newTimeFrame} saveField={saveField} setF={setF} setNewField={setNewField} setNewTimeFrame={setNewTimeFrame} timeFrames={timeFrames} />}

            {/* Users */}
            {view === 'users' && <UsersSection accounts={accounts} createAcct={createAcct} creating={creating} delAcct={delAcct} dirty={dirty} resetPw={resetPw} saveAllAccounts={saveAllAccounts} setAcct={setAcct} setCreating={setCreating} />}

            {/* Feedback */}
            {view === 'feedback' && <FeedbackSection delFb={delFb} feedback={feedback} setFbStatus={setFbStatus} />}

            {/* Delete requests */}
            {view === 'settings' && <SettingsSection emailOn={emailOn} toggleEmail={toggleEmail} />}

            {view === 'merges' && <MergeRequestsSection mergeRequests={mergeRequests} decideMerge={decideMerge} />}
            {view === 'deletions' && <DeleteRequestsSection deleteIdeaNow={deleteIdeaNow} deleteRequests={deleteRequests} dismissReq={dismissReq} />}
          </>
        )}
      </main>
    </div>
  );
}
