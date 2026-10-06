"use client";

// The wheel, animated from two facts: when the round settled and what it
// landed on. Nothing about the animation is pushed — every client computes the
// same rotation from the same row, which is what makes the table shared.

import { useEffect, useRef, useState } from "react";
import { POCKETS, colourOf } from "@/features/game/roulette/wheel";

const TURNS = 4;   // full rotations before settling, for the look of it

export default function Wheel({ result, settledAt, spinMs }) {
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const lastSettled = useRef(null);

  useEffect(() => {
    if (result == null || !settledAt) return;
    if (lastSettled.current === settledAt) return;      // already animated this one
    lastSettled.current = settledAt;

    const slot = POCKETS.indexOf(result);
    const per = 360 / POCKETS.length;
    // Where the wheel must stop. The extra turns are cosmetic; the final
    // position is a pure function of the result, so everyone stops together.
    const target = TURNS * 360 + (360 - slot * per);

    setSpinning(true);
    setAngle(target);
    const t = setTimeout(() => {
      setSpinning(false);
      // Normalise so the next spin's extra turns start from the same place.
      setAngle(target % 360);
    }, spinMs);
    return () => clearTimeout(t);
  }, [result, settledAt, spinMs]);

  return (
    <div className="rl-wheel">
      <div className="rl-wheel__pointer" aria-hidden="true" />
      <div
        className="rl-wheel__face"
        style={{
          transform: `rotate(${angle}deg)`,
          transition: spinning ? `transform ${spinMs}ms cubic-bezier(0.17, 0.67, 0.21, 1)` : "none",
        }}
      >
        {POCKETS.map((n, i) => (
          <span key={n} className={`rl-pocket rl-pocket--${colourOf(n)}`}
            style={{ transform: `rotate(${(360 / POCKETS.length) * i}deg)` }}>
            <b>{n}</b>
          </span>
        ))}
      </div>
      <div className="rl-wheel__hub">
        {result != null && !spinning ? <span className={`rl-hub-num rl-pocket--${colourOf(result)}`}>{result}</span> : <span className="rl-hub-idle">·</span>}
      </div>
    </div>
  );
}
