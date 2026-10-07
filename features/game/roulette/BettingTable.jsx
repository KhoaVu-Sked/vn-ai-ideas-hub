"use client";

// The felt. Every control is disabled once betting closes or the balance runs
// out, and says which — a dead button with no reason is the thing people file
// bugs about.

import { colourOf } from "@/features/game/roulette/wheel";

const NUMBERS = Array.from({ length: 36 }, (_, i) => i + 1);

export default function BettingTable({ onBet, disabled, reason, stake, onStake, coins }) {
  const place = (kind, value) => { if (!disabled) onBet(kind, value); };
  const chip = (n) => (
    <button key={n} onClick={() => onStake(n)} disabled={n > coins}
      className={`rl-chip${stake === n ? " is-on" : ""}`}>{n}</button>
  );

  return (
    <div className="rl-felt">
      <div className="rl-stakes">
        <span className="rl-label">Chip</span>
        {[10, 50, 100, 500, 1000].map(chip)}
        {disabled && reason && <span className="rl-reason">{reason}</span>}
      </div>

      {/* 1..36 in order, laid out column-major by CSS, which puts 1-2-3 in the
          first column and makes each row one of the three column bets. The
          buttons for those sit at the end of their own row for the same
          reason — a bet you cannot point at is a bet people get wrong. */}
      <div className="rl-grid">
        <button className="rl-cell rl-pocket--green rl-zero" disabled={disabled}
          onClick={() => place("number", 0)}>0</button>
        <div className="rl-numbers">
          {NUMBERS.map((n) => (
            <button key={n} disabled={disabled} onClick={() => place("number", n)}
              className={`rl-cell rl-pocket--${colourOf(n)}`}>{n}</button>
          ))}
        </div>
        <div className="rl-cols">
          {[1, 2, 3].map((c) => (
            <button key={`c${c}`} className="rl-cell" disabled={disabled}
              aria-label={`Column ${c} — this row, pays 2 to 1`}
              onClick={() => place("column", c)}>Col {c}</button>
          ))}
        </div>
      </div>

      <div className="rl-below">
        <div className="rl-outside">
          {[1, 2, 3].map((d) => (
            <button key={`d${d}`} className="rl-cell rl-wide" disabled={disabled}
              onClick={() => place("dozen", d)}>{["1st 12", "2nd 12", "3rd 12"][d - 1]}</button>
          ))}
        </div>
        <div className="rl-outside">
          <button className="rl-cell" disabled={disabled} onClick={() => place("low", null)}>1–18</button>
          <button className="rl-cell" disabled={disabled} onClick={() => place("even", null)}>Even</button>
          <button className="rl-cell rl-pocket--red" disabled={disabled} onClick={() => place("red", null)}>Red</button>
          <button className="rl-cell rl-pocket--black" disabled={disabled} onClick={() => place("black", null)}>Black</button>
          <button className="rl-cell" disabled={disabled} onClick={() => place("odd", null)}>Odd</button>
          <button className="rl-cell" disabled={disabled} onClick={() => place("high", null)}>19–36</button>
        </div>
      </div>
    </div>
  );
}
