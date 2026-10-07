"use client";

// The shared table.
//
// State is read from the server, never invented here. The client's clock is
// used only to decide when to *ask* whether a round is over; the server checks
// the deadline against its own clock before settling anything.
//
// Two things are tracked and they are deliberately out of step. `live` is what
// the server last said, and it decides when to ask for a settle. `view` is what
// the screen draws, and it lags `live` by one spin so the number, the balances
// and the announcement arrive WITH the wheel instead of ahead of it. See
// reveal.js.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import RouletteWheel from "@/features/game/roulette/RouletteWheel";
import BettingTable from "@/features/game/roulette/BettingTable";
import SidePanel from "@/features/game/roulette/SidePanel";
import { colourOf } from "@/features/game/roulette/wheel";
import { holdMs, isNewSpin, shoutsToRaise, spinIdOf, tableView } from "@/features/game/roulette/reveal";
import { api } from "@/lib/apiClient";
import useLive from "@/features/realtime/useLive";
import { GAME_SCOPE } from "@/features/game/scope";

const POLL_MS = 5_000;   // the fallback. Redis makes it feel instant; this makes it work.

export default function RoulettePage() {
  const [live, setLive] = useState(null);
  const [held, setHeld] = useState(null);      // { snapshot, until } while the wheel turns
  const [stake, setStake] = useState(100);
  const [err, setErr] = useState("");
  const [shouts, setShouts] = useState([]);
  const settling = useRef(false);
  const liveRef = useRef(null);
  const seenSpin = useRef(undefined);

  const load = useCallback(async () => {
    try {
      const next = await api("/api/game/roulette/state");
      const prev = liveRef.current;
      // Freeze the board on a spin we have not shown yet. Checked against
      // seenSpin rather than against the hold, so the polls that arrive during
      // a hold cannot keep restarting it and strand the result off screen.
      if (prev && isNewSpin(seenSpin.current, next)) {
        setHeld({ snapshot: prev, until: Date.now() + holdMs(next.spinMs) });
      }
      seenSpin.current = spinIdOf(next);
      liveRef.current = next;
      setLive(next);
    } catch (e) {
      setErr(e.message || "Lost the table.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Redis pushes when it can; this runs regardless. The game must not depend on
  // a layer that has previously looked alive here while delivering nothing.
  useEffect(() => {
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useLive(GAME_SCOPE, load);

  // The hold ends when this screen's own wheel stops.
  useEffect(() => {
    if (!held) return undefined;
    const t = setTimeout(() => setHeld(null), Math.max(0, held.until - Date.now()));
    return () => clearTimeout(t);
  }, [held]);

  // Ask the server to settle once the deadline has passed. Every client asks;
  // the first wins and the rest are no-ops, which is why no scheduler exists.
  // Scheduled off `live`, never off the view — a frozen board is still a table
  // whose next round is running.
  useEffect(() => {
    const r = live?.round;
    if (!r) return undefined;
    const due = new Date(r.closesAt).getTime() - Date.now();
    const t = setTimeout(async () => {
      if (settling.current) return;
      settling.current = true;
      try { await api("/api/game/roulette/settle", { method: "POST" }); }
      catch { /* someone else got there, or the network blinked */ }
      finally { settling.current = false; load(); }
    }, Math.max(0, due) + 400);   // a beat past the deadline, so the server agrees
    return () => clearTimeout(t);
  }, [live?.round?.id, live?.round?.closesAt, load]);

  const view = useMemo(() => tableView(live, held), [live, held]);
  const shownSpin = view?.lastSpin ?? null;

  // Announcements belong to the spin the screen is showing, not to whoever won
  // the settle race. Reading them off the settle response meant exactly one
  // client saw a 5× win go up and the rest of the table never did.
  const shoutedFor = useRef(undefined);
  useEffect(() => {
    if (!view) return;
    const next = shoutsToRaise(shoutedFor.current, shownSpin);
    if (!next) return;
    shoutedFor.current = next.at;
    if (next.raise.length) {
      setShouts((s) => [...s, ...next.raise.map((x, i) => ({ ...x, key: `${next.at}-${i}` }))]);
    }
  }, [view, shownSpin]);

  // Shouts fade on their own.
  useEffect(() => {
    if (shouts.length === 0) return undefined;
    const t = setTimeout(() => setShouts((s) => s.slice(1)), 5000);
    return () => clearTimeout(t);
  }, [shouts]);

  const bet = async (kind, value) => {
    setErr("");
    try {
      const res = await api("/api/game/roulette/bet", {
        method: "POST", body: JSON.stringify({ kind, value, stake }),
      });
      // Your own debit shows at once — it is the RESULT that waits for the
      // wheel, and betting is closed by the time anything is held.
      const now = liveRef.current;
      if (now) {
        const next = { ...now, me: { ...now.me, coins: res.coins } };
        liveRef.current = next;
        setLive(next);
      }
      load();
    } catch (e) {
      setErr(e.message || "That bet did not go on.");
    }
  };

  const send = async (body) => {
    try { await api("/api/game/roulette/chat", { method: "POST", body: JSON.stringify({ body }) }); load(); }
    catch (e) { setErr(e.message || "Message did not send."); }
  };

  if (!view) {
    return (<><AppHeader /><main className="rl-wrap"><p className="rl-empty">Finding the table…</p></main></>);
  }

  const { me, round, results, bets, chat, players } = view;
  const closed = !round || new Date(round.closesAt).getTime() <= Date.now();
  const broke = me.coins <= 0;
  const myBets = (bets || []).filter((b) => b.accountId === me.id);

  return (
    <>
      <AppHeader />
      <main className="rl-wrap">
        <div className="rl-shouts" aria-live="polite">
          {shouts.map((s) => (
            <div key={s.key} className="rl-shout">
              🎉 <b>{s.who}</b> took {Number(s.payout).toLocaleString()} on {s.kind}
              {s.value != null ? ` ${s.value}` : ""}
            </div>
          ))}
        </div>

        <div className="rl-last">
          <span className="rl-label">Last 10</span>
          {(results || []).length === 0 && <span className="rl-empty">No spins yet.</span>}
          {(results || []).map((r) => (
            <span key={r.id} className={`rl-last__n rl-pocket--${colourOf(r.result)}`}>{r.result}</span>
          ))}
        </div>

        <div className="rl-layout">
          <div className="rl-main">
            <div className="rl-stage">
              {/* The one thing read from `live` rather than the view: the wheel
                  is what everything else is waiting for. */}
              <RouletteWheel result={live.lastSpin?.result ?? null} settledAt={live.lastSpin?.settledAt ?? null} spinMs={live.spinMs} />
              <div className="rl-status">
                <div className="rl-coins">{Number(me.coins).toLocaleString()} <span>coins</span></div>
                {broke
                  ? <div className="rl-broke">Out of coins — message <b>Khoa Vu</b> on Slack for a top-up. You can still watch and chat.</div>
                  : closed ? <div className="rl-phase">Spinning…</div>
                  : <Countdown to={round.closesAt} />}
                {myBets.length > 0 && (
                  <div className="rl-mybets">
                    Your bets: {myBets.map((b) => `${b.kind}${b.value != null ? ` ${b.value}` : ""} (${b.stake})`).join(", ")}
                  </div>
                )}
              </div>
            </div>

            {err && <div className="rl-err">{err}</div>}

            <BettingTable
              onBet={bet} stake={stake} onStake={setStake} coins={me.coins}
              disabled={closed || broke}
              reason={broke ? "No coins left." : closed ? "Betting is closed for this round." : ""}
            />
          </div>

          <SidePanel players={players || []} chat={chat || []} onSend={send} meId={me.id} />
        </div>
      </main>
    </>
  );
}

function Countdown({ to }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(to).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, new Date(to).getTime() - Date.now())), 250);
    return () => clearInterval(t);
  }, [to]);
  return <div className="rl-phase">Betting closes in {Math.ceil(left / 1000)}s</div>;
}
