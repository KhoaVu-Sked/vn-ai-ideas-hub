"use client";

// The shared table.
//
// State is read from the server, never invented here. The client's clock is
// used only to decide when to *ask* whether a round is over; the server checks
// the deadline against its own clock before settling anything.

import { useCallback, useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import RouletteWheel from "@/features/game/roulette/RouletteWheel";
import BettingTable from "@/features/game/roulette/BettingTable";
import SidePanel from "@/features/game/roulette/SidePanel";
import { colourOf } from "@/features/game/roulette/wheel";
import { api } from "@/lib/apiClient";
import useLive from "@/features/realtime/useLive";
import { GAME_SCOPE } from "@/features/game/scope";

const POLL_MS = 5_000;   // the fallback. Redis makes it feel instant; this makes it work.

export default function RoulettePage() {
  const [state, setState] = useState(null);
  const [stake, setStake] = useState(100);
  const [err, setErr] = useState("");
  const [shouts, setShouts] = useState([]);
  const settling = useRef(false);

  const load = useCallback(async () => {
    try {
      setState(await api("/api/game/roulette/state"));
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

  // Ask the server to settle once the deadline has passed. Every client asks;
  // the first wins and the rest are no-ops, which is why no scheduler exists.
  useEffect(() => {
    const r = state?.round;
    if (!r) return undefined;
    const due = new Date(r.closesAt).getTime() - Date.now();
    const t = setTimeout(async () => {
      if (settling.current) return;
      settling.current = true;
      try {
        const res = await api("/api/game/roulette/settle", { method: "POST" });
        if (res?.shouts?.length) {
          setShouts((s) => [...s, ...res.shouts.map((x) => ({ ...x, key: `${Date.now()}-${x.who}` }))]);
        }
      } catch { /* someone else got there, or the network blinked */ }
      finally { settling.current = false; load(); }
    }, Math.max(0, due) + 400);   // a beat past the deadline, so the server agrees
    return () => clearTimeout(t);
  }, [state?.round?.id, state?.round?.closesAt, load]);

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
      setState((s) => (s ? { ...s, me: { ...s.me, coins: res.coins } } : s));
      load();
    } catch (e) {
      setErr(e.message || "That bet did not go on.");
    }
  };

  const send = async (body) => {
    try { await api("/api/game/roulette/chat", { method: "POST", body: JSON.stringify({ body }) }); load(); }
    catch (e) { setErr(e.message || "Message did not send."); }
  };

  if (!state) {
    return (<><AppHeader /><main className="rl-wrap"><p className="rl-empty">Finding the table…</p></main></>);
  }

  const { me, round, lastSpin, results, bets, chat, players, spinMs } = state;
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
              <RouletteWheel result={lastSpin?.result ?? null} settledAt={lastSpin?.settledAt ?? null} spinMs={spinMs} />
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
