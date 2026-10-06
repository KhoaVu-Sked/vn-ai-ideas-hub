"use client";

// Who is here, and what they are saying. Chat is shown for ten minutes and
// then gone, which is why nothing here is worth keeping.

import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { initialsOf, avatarColor } from "@/features/accounts/avatar";
import { onEnter } from "@/lib/onEnter";

export default function SidePanel({ players, chat, onSend, meId }) {
  const [text, setText] = useState("");
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [chat.length]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    onSend(body);
  };

  return (
    <aside className="rl-side">
      <section className="rl-card">
        <div className="rl-card__head">At the table · {players.length}</div>
        <div className="rl-players">
          {players.length === 0 && <div className="rl-empty">Nobody else just now.</div>}
          {players.map((p) => (
            <div key={p.account_id} className="rl-player">
              {p.avatar_url
                ? <Avatar person={p} size={24} />
                : <span className="rl-ava" style={{ background: avatarColor(p) }}>{initialsOf(p.who)}</span>}
              <span className="rl-player__name">{p.who}{p.account_id === meId ? " (you)" : ""}</span>
              <span className="rl-player__coins">{Number(p.coins).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rl-card rl-card--grow">
        <div className="rl-card__head">Chat · clears after 10 minutes</div>
        <div className="rl-chat">
          {chat.length === 0 && <div className="rl-empty">Say something.</div>}
          {chat.map((m) => (
            <div key={m.id} className="rl-msg">
              <b>{m.who}</b> {m.body}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="rl-chat__input">
          <input value={text} maxLength={300} placeholder="Message the table"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onEnter(send)} />
          <button onClick={send} disabled={!text.trim()}>Send</button>
        </div>
      </section>
    </aside>
  );
}
