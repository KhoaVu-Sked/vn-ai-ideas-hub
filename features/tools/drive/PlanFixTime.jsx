"use client";

// Putting the work on a calendar.
//
// The slot grid renders with nothing greyed out and stays usable that way: the
// free/busy check is a separate, optional step. Someone who does not want a
// file-sharing tool anywhere near their calendar can still pick a time and get
// a prefilled event, which is the whole reason the check is opt-in rather than
// asked for on open.
//
// Booking happens in Google Calendar. This never holds write access.

import { useCallback, useEffect, useMemo, useState } from "react";
import { SCOPE_FREEBUSY } from "@/features/tools/drive/constants";
import { canSeeCalendar } from "@/features/tools/drive/scopes";
import {
  workingDays, slotsFor, busyWindow, isOffered, eventDetails,
  calendarTemplateUrl, icsFile, DURATIONS, EVENT_TITLE,
} from "@/features/tools/drive/plan";

const scrim = {
  position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", zIndex: 200,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
const panel = {
  background: "var(--card)", borderRadius: 14, width: 560, maxWidth: "100%",
  padding: 22, maxHeight: "90vh", overflowY: "auto",
};
const label = { fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em", textTransform: "uppercase" };

const DAYS_OFFERED = 5;

const pill = (on) => ({
  border: `1px solid ${on ? "var(--blue)" : "var(--line)"}`,
  background: on ? "var(--blue)" : "#fff",
  color: on ? "#fff" : "var(--body)",
  borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
});

export default function PlanFixTime({ findings, token, grantedScope, onNeedScope, onClose, now = new Date() }) {
  const [duration, setDuration] = useState(30);
  const [dayIndex, setDayIndex] = useState(0);
  const [startMin, setStartMin] = useState(null);
  const [busy, setBusy] = useState(null);          // null = never checked
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState("");
  // Consent is a round trip through a Google popup. Without remembering that a
  // check was asked for, the first click only raised the prompt and then sat
  // there — the person had to work out for themselves to click it again.
  const [wantCheck, setWantCheck] = useState(false);

  const days = useMemo(() => workingDays(DAYS_OFFERED, now), [now]);
  const day = days[dayIndex] || days[0];
  const slots = useMemo(
    () => (day ? slotsFor(day, duration, busy || [], now) : []),
    [day, duration, busy, now],
  );
  const chosen = slots.find((s) => s.startMin === startMin && isOffered(s)) || null;

  const details = useMemo(() => eventDetails(findings), [findings]);

  const runCheck = useCallback(async () => {
    setChecking(true); setProblem("");
    try {
      const window = busyWindow(days);
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...window, items: [{ id: "primary" }] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error?.message || `Google Calendar returned ${res.status}.`);

      // A 200 can still carry a per-calendar failure. Treating that as "no busy
      // times" would grey out nothing and offer slots over real meetings, which
      // is worse than admitting the check did not work.
      const primary = body.calendars?.primary;
      const failed = primary?.errors?.[0]?.reason;
      if (failed) throw new Error(`Google could not read your calendar (${failed}).`);
      if (!primary?.busy) throw new Error("Google returned no availability for your calendar.");

      setBusy(primary.busy);
      setStartMin(null);          // a slot picked before the check may now be taken
    } catch (e) {
      setProblem(e.message || "Your calendar could not be read.");
    } finally {
      setChecking(false);
    }
  }, [days, token]);

  const check = () => {
    if (!canSeeCalendar(grantedScope)) { setWantCheck(true); onNeedScope(SCOPE_FREEBUSY); return; }
    runCheck();
  };

  // Consent granted after the button was pressed: pick the check back up.
  useEffect(() => {
    if (wantCheck && canSeeCalendar(grantedScope)) { setWantCheck(false); runCheck(); }
  }, [wantCheck, grantedScope, runCheck]);

  const download = () => {
    const file = icsFile({ start: chosen.start, end: chosen.end, details });
    // The body carries •, —, … and curly quotes. Without the charset Outlook
    // imports them as mojibake.
    const url = URL.createObjectURL(new Blob([file], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "fix-drive-sharing.ics";
    // Firefox and Safari ignore a click on an anchor that is not in the
    // document, and revoking the url in the same tick can beat the download to
    // it. Both are silent failures.
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
  };

  const offeredCount = slots.filter(isOffered).length;

  return (
    <div style={scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={panel} role="dialog" aria-label="Plan time to fix these findings">
        <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>
          Plan time to fix these
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 18px", lineHeight: 1.6 }}>
          Pick a slot and the event opens in Google Calendar, filled in and ready to save. Nothing is
          written to your calendar from here.
        </p>

        <p style={{ ...label, margin: "0 0 8px" }}>How long</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {DURATIONS.map((d) => (
            <button key={d.minutes} onClick={() => { setDuration(d.minutes); setStartMin(null); }}
              style={pill(duration === d.minutes)} aria-pressed={duration === d.minutes}>
              {d.label}
            </button>
          ))}
        </div>

        <p style={{ ...label, margin: "0 0 8px" }}>Which day</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {days.map((d, i) => (
            <button key={d.toISOString()} onClick={() => { setDayIndex(i); setStartMin(null); }}
              style={pill(dayIndex === i)} aria-pressed={dayIndex === i}>
              {/* Not `i === 0`: on a weekend the first day offered is Monday,
                  and labelling it "Today" books the wrong day. */}
              {d.toDateString() === new Date(now).toDateString()
                ? "Today"
                : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
          <p style={{ ...label, margin: 0 }}>What time</p>
          {busy === null ? (
            <button onClick={check} disabled={checking}
              style={{ border: "none", background: "none", color: "var(--blue)", fontSize: 12.5, fontWeight: 700, cursor: checking ? "wait" : "pointer", padding: 0 }}>
              {checking ? "Reading your calendar…" : "Check my calendar"}
            </button>
          ) : (
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
              {busy.length ? "Busy times are greyed out" : "Nothing in your calendar these days"}
            </span>
          )}
        </div>

        {busy === null && (
          <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>
            Every working hour is offered until you check. The check reads free/busy only — never what
            any of your events are.
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {slots.map((s) => {
            const open = isOffered(s);
            const on = startMin === s.startMin && open;
            return (
              <button key={s.startMin} onClick={() => open && setStartMin(s.startMin)} disabled={!open}
                aria-pressed={on}
                title={s.busy ? "You are busy then" : s.past ? "Already gone" : undefined}
                style={{
                  border: `1px solid ${on ? "var(--blue)" : "var(--line)"}`,
                  background: on ? "var(--blue)" : open ? "#fff" : "var(--bg)",
                  color: on ? "#fff" : open ? "var(--body)" : "var(--faint)",
                  borderRadius: 8, padding: "5px 10px", fontSize: 12.5,
                  fontWeight: on ? 700 : 500,
                  cursor: open ? "pointer" : "not-allowed",
                  textDecoration: s.busy ? "line-through" : "none",
                }}>
                {s.label}
              </button>
            );
          })}
        </div>

        {!offeredCount && (
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Nothing free on this day at {duration} minutes. Try a shorter block, or another day.
          </p>
        )}

        {problem && (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#c92a2a", lineHeight: 1.5 }}>{problem}</p>
        )}

        <div style={{ borderTop: "1px solid var(--line)", marginTop: 18, paddingTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <a
            href={chosen ? calendarTemplateUrl({ start: chosen.start, end: chosen.end, details }) : undefined}
            target="_blank" rel="noreferrer"
            aria-disabled={!chosen}
            onClick={(e) => !chosen && e.preventDefault()}
            style={{
              background: chosen ? "var(--blue)" : "var(--line)",
              color: chosen ? "#fff" : "var(--faint)",
              borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700,
              textDecoration: "none", cursor: chosen ? "pointer" : "not-allowed",
            }}>
            Open in Google Calendar
          </a>
          <button onClick={download} disabled={!chosen}
            style={{
              border: "1px solid var(--line)", background: "#fff",
              color: chosen ? "var(--blue)" : "var(--faint)",
              borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700,
              cursor: chosen ? "pointer" : "not-allowed",
            }}>
            Download .ics
          </button>
          <button onClick={onClose}
            style={{ marginLeft: "auto", border: "none", background: "none", color: "var(--muted)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Close
          </button>
        </div>

        <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>
          The event is titled “{EVENT_TITLE}” and lists the worst findings with their links, so it is a
          working list rather than a reminder to make one.
        </p>
      </div>
    </div>
  );
}
