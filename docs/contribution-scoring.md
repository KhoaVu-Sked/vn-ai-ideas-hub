# Contribution scoring — draft spec

**Status:** draft for review. Not built.
**Context:** the VN TS - AI Ideas Hub leader dashboard shows a "Top contributors" panel. This document defines how that score should be calculated.

---

## 1. Why the current formula is being replaced

Today the dashboard uses:

```
score = ideas_submitted × 5  +  requests_written × 1  +  team_memberships × 2
```

Five problems:

1. **The cheapest action is unbounded.** 30 comments (30 pts) beats leading five ideas (25 pts).
2. **It measures effort, not outcome.** A launched idea scores the same as one still sitting in Submitted.
3. **It credits the wrong person for leading.** `ideas_submitted` counts whoever filled in the form, which is not necessarily whoever is driving the idea.
4. **Observers score like workers.** Joining a team as an Observer earns the same 2 points as doing Data / Ops.
5. **It ignores time.** Joining an idea the week before it launches earns the same as being on it from day one.

---

## 2. Principles

- **An idea is worth a fixed amount.** Contributors divide that amount. Nobody can inflate the total by being busy.
- **Shipping is worth more than starting**, but starting still counts — we want people submitting ideas.
- **You earn at the moment work happens**, not from a snapshot of who happens to be on the team today.
- **Observers earn nothing.** Watching an idea is not contributing to it.
- **Every number must be explainable in one sentence.** A score people can't reconstruct is a score they will argue about.

---

## 3. The delivery pool

An idea carries two separate pools: a **delivery pool of 16 points** for moving it through its stages (this section), and an **input pool of 4 points** for the requests and comments written on it (§6). An idea is worth at most **20 points in total**, however many people touch it.

The delivery pool is released in instalments as the idea advances. Each instalment is awarded **the first time** that stage is reached.

| Stage reached | Instalment | Running total |
|---|---:|---:|
| Submitted | +4 | 4 |
| In Review | +2 | 6 |
| Approved | +2 | 8 |
| In Progress | +2 | 10 |
| Pilot | +3 | 13 |
| Launched | +3 | 16 |

**On Hold** and **Declined** release nothing. Points already awarded are kept. If an On Hold idea later resumes, it continues from where it left off.

---

## 4. Roles and weights

**Initiator and Project Lead are two separate roles.** They are frequently the same person, but they are not the same job:

- **Initiator** — raised the idea. A single discrete act, at the beginning.
- **Project Lead** — accountable for driving the idea through its stages. Sustained work, from start to finish.

One of each per idea, maximum. They may be held by the same person, by two different people, or — for Project Lead — by nobody yet.

| Role | Weight | Earns on |
|---|---:|---|
| Project Lead | 4.0 | every instalment |
| AI Design | 2.0 | every instalment |
| Form / UX Design | 2.0 | every instalment |
| Data / Ops | 2.0 | every instalment |
| Tester | 1.5 | every instalment |
| **Initiator** | **2.0** | **the Submitted instalment only** |
| **Observer** | **0** | **never** |

### 4.1 Why Initiator earns only once

Raising an idea is a one-off act, so it earns a one-off award. If the Initiator carried a standing weight through every instalment, someone could submit a form, never touch the idea again, and collect roughly a quarter of a launched idea's pool.

From In Review onward, the Initiator's weight is **0** unless they also hold another role — which, in practice, they usually will (most initiators take Project Lead too).

The Initiator is **set when the idea is created and cannot be self-assigned by joining a team.** That closes the obvious loophole.

### 4.2 Observers

Observers have weight 0. They earn nothing, they are excluded from the team total, and they do not count toward the multi-role bonus below. An Observer is a subscriber, not a contributor. Following an idea is already available separately for people who just want updates.

### 4.3 One person holding several roles

A member can hold multiple roles on one idea. Summing them lets someone tick every box and take most of the pool, so:

> **A person's weight = their highest-weighted role, plus 0.5 for each additional role, capped at +1.0.**
> Observers, and the Initiator role after the Submitted instalment, do not count as additional roles.

Maximum possible weight is **5.0** (Project Lead plus two or more other roles). Someone who ticks every role except Project Lead reaches only 3.0 — well below a genuine lead — so role-stacking is not worth doing.

### 4.4 Several people holding the same role

Each of them counts their **own full weight**. Two people in Data / Ops are 2.0 each, not 1.0 each.

A bigger team therefore divides the pool more ways. That is intended — the idea is worth what it's worth. What we specifically avoid is telling someone their score dropped because a colleague joined their role.

### 4.5 The denominator floor

```
share = instalment × person_weight / max(total_team_weight, 6)
```

Without the floor, a solo Project Lead (weight 4) would take 100% of every instalment. With it, they take 4/6 and the remainder is simply **not awarded**. Undistributed points do not roll over.

---

## 5. Timing — the part that matters most

Scores are **not** recalculated from the current team. Each instalment is awarded at the moment the stage is reached, to the people on the team **at that moment**, and the award is stored permanently.

Consequences:

- Someone who joins at Pilot earns only the Pilot and Launched instalments.
- Someone who leaves keeps everything they earned before leaving.
- A newly appointed Project Lead earns lead weight from the **next** instalment onward, not retroactively.
- Joining an already-Launched idea earns nothing — there are no instalments left.

This requires an **awards ledger**: one row per (idea, person, stage, points, timestamp), written when the status changes.

> **This cannot be backfilled.** There is no record of who was on which team at past transitions. On the day this ships, award all instalments accrued so far to each idea's *current* team, and be accurate from then on. Existing ideas will be approximate forever.

---

## 6. The input pool — requests and comments

Requests must count for something, but the first draft of this spec got them wrong in five ways, all worth stating so they don't get reintroduced:

1. **They were unbounded in total.** Capping at 2.0 *per person* meant an idea with ten commenters generated 20 points of engagement against 16 for actually delivering it. That breaks the "an idea is worth a fixed amount" principle.
2. **Editing a request cost you points.** Editing resets a request to Open by design (a triage verdict was about the old text), which would have dropped an accepted request from 1.0 to 0.25. Fixing a typo shouldn't cost you.
3. **Closing a request cost you points.** Closed usually means *done*, not rejected — but it read as "not accepted".
4. **The lead could earn twice.** A Project Lead commenting on their own idea collected input points on top of their delivery share, and is also the person who decides what counts as Accepted.
5. **It was a live snapshot**, while everything else in this spec is an immutable award. A lead re-triaging an old request would silently rewrite someone's score.

### 6.1 The rule

Each idea releases a fixed **input pool of 4 points**, shared among everyone who wrote a request on it.

A request is worth:

| Request outcome | Weight |
|---|---:|
| Accepted (now, or at any point in the past) | 1.0 |
| Under discussion | 0.5 |
| Open | 0.25 |
| Closed, never accepted | 0.25 |
| Declined | 0.1 |

**"At any point in the past" is the important clause.** Acceptance is recorded once and never withdrawn — a `requests.accepted_at` timestamp, set the first time a request is accepted and never cleared. That single nullable column fixes problems 2 and 3 above: editing or closing an accepted request keeps its 1.0.

Declined is 0.1 rather than 0 deliberately. Raising a concern that gets turned down is still participation, and scoring it zero teaches people to only say safe things.

### 6.2 Caps

**A person's request weight on one idea is capped at 2.0** — about two accepted requests. Beyond that, more comments on the same idea earn nothing.

```
share = 4 × min(person_weight, 2.0) / max(sum of all capped weights, 4)
```

The floor of 4 stops one person with a single open request taking the whole pool.

| Situation | Result |
|---|---|
| One person, one accepted request | 4 × 1.0/4 = **1.0** |
| Five people, one accepted request each | 4 × 1.0/5 = **0.8** each (4.0 total) |
| One person, ten open requests | weight capped at 2.0 → **2.0** |

### 6.3 The Project Lead earns nothing here

Requests written by the idea's **Project Lead on their own idea earn 0**. They already hold the largest delivery share, and they are the person who decides what counts as Accepted — so this also closes the self-accept loop without needing to track who accepted what.

If the lead changes, this applies to whoever holds the role at the time the score is computed.

### 6.4 Governance note

Only the Project Lead and admins can triage a request. That means **the lead controls other people's input points.** On a 10–30 person team that is a social dynamic worth being aware of, not a technical flaw. The 0.1 floor for Declined and the modest size of the input pool (4 vs 16) both limit how much damage a harsh or generous lead can do.

**Total score = delivery awards + input pool shares.**

## 7. Worked examples

### A — clean run, stable team, initiator is also the lead

**A** is Initiator + Project Lead, **B** is Form/UX, **C** is Data/Ops. All three from the start. Idea reaches Launched.

*Submitted instalment (+4).* A's weight is 4.0 (highest = Project Lead) + 0.5 (one additional role, Initiator) = 4.5. Team total 8.5.

| Person | Calculation | Award |
|---|---|---:|
| A | 4 × 4.5/8.5 | 2.12 |
| B | 4 × 2.0/8.5 | 0.94 |
| C | 4 × 2.0/8.5 | 0.94 |

*Remaining instalments (+12).* A's Initiator role is now inert, so A is 4.0 flat. Team total 8.

| Person | Calculation | Award |
|---|---|---:|
| A | 12 × 4/8 | 6.00 |
| B | 12 × 2/8 | 3.00 |
| C | 12 × 2/8 | 3.00 |

**Totals: A 8.12, B 3.94, C 3.94.** All 16 points distributed.

### B — Initiator and Project Lead are different people

**A** raised the idea and does nothing further. **D** leads it to Launched.

*Submitted (+4).* A = 2.0, D = 4.0, total 6.0 → A **1.33**, D **2.67**.

*Remaining (+12).* A's weight is now 0, so A is excluded. D alone at 4.0, denominator `max(4, 6) = 6` → D **8.00**. The other 4.00 is not awarded.

**Totals: A 1.33, D 10.67.** A passive initiator keeps about 8% of the pool — real recognition for having the idea, not a share of the delivery.

### C — someone joins at Pilot

**A** Initiator + Project Lead, **B** Form/UX from the start; **C** joins as Data/Ops at Pilot.

| Person | Submitted (+4) | In Review→In Progress (+6) | Pilot + Launched (+6) | Total |
|---|---|---|---|---:|
| A | 4 × 4.5/6.5 = 2.77 | 6 × 4/6 = 4.00 | 6 × 4/8 = 3.00 | **9.77** |
| B | 4 × 2.0/6.5 = 1.23 | 6 × 2/6 = 2.00 | 6 × 2/8 = 1.50 | **4.73** |
| C | — | — | 6 × 2/8 = 1.50 | **1.50** |

C earns 1.50 instead of the 4.00 a snapshot model would give. A and B are compensated for carrying the early stages.

### D — role stacker joining late

Someone joins an In Progress idea ticking AI Design + Form/UX + Data/Ops + Tester. They cannot tick Initiator (set at creation) or Project Lead (already taken).

Weight = 2.0 (highest) + 1.0 (capped bonus) = **3.0**, not 7.5. They earn nothing for the four stages before they joined. Alongside a lead at 4.0, team total 7, remaining instalments 6:

`6 × 3/7 = 2.57`

Compare the lead who saw the idea through from Submitted: 9.77 in example C.

### E — the input pool

Idea led by **A**. Requests: **B** wrote one that was accepted then later closed; **C** wrote four that are still open; **D** wrote one that was declined; **A** (the lead) wrote three, one accepted.

| Person | Weight | Note |
|---|---|---:|
| B | 1.0 | accepted_at is set — closing it doesn't remove the credit |
| C | min(4 × 0.25, 2.0) = 1.0 | four open requests |
| D | 0.1 | declined, but not zero |
| A | 0 | Project Lead of this idea |

Total 2.1, below the floor of 4, so `denominator = 4`:

| Person | Calculation | Award |
|---|---|---:|
| B | 4 × 1.0/4 | **1.00** |
| C | 4 × 1.0/4 | **1.00** |
| D | 4 × 0.1/4 | **0.10** |

2.9 of the input pool goes unawarded. That's intended — a thinly-discussed idea shouldn't hand out the same total as a busy one.

---

## 8. Edge cases

| Situation | Behaviour |
|---|---|
| Stage regressed, then re-reached | Award once only, the first time |
| On Hold | No instalment; resumes on the next new stage |
| Declined | No further instalments; accrued points kept |
| Member leaves or is removed | Keeps past awards, earns no future ones |
| Project Lead reassigned | New lead earns lead weight from the next instalment |
| Idea has no Project Lead yet | Nobody holds that weight; the team total is smaller and the floor absorbs it |
| Initiator leaves the team | Keeps the Submitted award; they had no further weight anyway |
| Initiator also holds another role | Both count at Submitted (+0.5 bonus); only the other role counts afterwards |
| Observer | Weight 0 — never earns, excluded from the team total and the multi-role bonus |
| Idea deleted | Its awards are deleted with it |
| Account deleted | Its awards are deleted with it |
| Request edited (state resets to Open) | Keeps its 1.0 if it was ever accepted (`accepted_at`) |
| Request closed after being accepted | Keeps 1.0 |
| Request closed, never accepted | 0.25 |
| Request accepted, then re-triaged to Declined | Keeps 1.0 — acceptance is never withdrawn |
| Request deleted | Earns nothing; the pool redistributes to the rest |
| Request author is the Project Lead of that idea | 0 |
| Request author later leaves the team | Keeps input points — they don't depend on membership |

---

## 9. Prerequisites

Three gaps remain, or the score faithfully records ungoverned behaviour. (The first is now done.)

1. ~~**Split Initiator from Project Lead.**~~ **Done** — `migrations/012_split_initiator_lead.sql`. They are now two roles, one of each per idea, each with its own partial unique index. Initiator is set at submission and cannot be self-assigned by joining a team; only an admin can correct it.
2. **Join approval.** Anyone signed in can currently self-assign any role except the lead, with no approval. The v0.1 requirements specify lead approval; it was never built. This is the main way to game any scoring model.
3. **`requests.accepted_at`.** A nullable timestamp set the first time a request is accepted and never cleared. Without it, editing or closing a request silently removes its author's points (§6).
4. **Per-role headcount caps.** The requirements specify AI Design 0–2, Form/UX 0–2, Data/Ops 0–2. Not enforced. Enforcing them bounds the team weight and makes scores stable.

Suggested order: ~~role split~~ → **join approval + role caps → `accepted_at` → awards ledger → scoring.** The scoring is the last and smallest piece.

---

## 10. Open decisions

| Question | Default proposed |
|---|---|
| Delivery pool per idea | 16 |
| Input pool per idea | 4 |
| Input weight per person, capped at | 2.0 |
| Input pool floor | 4 |
| Declined request weight | 0.1 (not 0) |
| Initiator weight | 2.0, Submitted instalment only |
| Is Tester 1.5 or 2.0? | 1.5 |
| Denominator floor | 6 |
| Does the period filter apply to contributors? | Yes — delivery awards by award date, input by request date |
| Show a single ranked score at all? | **Open.** See below |

### On whether to show a leaderboard

With 10–30 people who all know each other, a ranked score can produce the behaviour it's trying to measure: name-on-everything, comment farming. An unranked "contribution mix" — *ideas raised · ideas led · roles held · requests written* per person — gives leads the same information without the scoreboard dynamics.

If a single number is kept, show the breakdown on hover. An unexplainable score gets argued with.

---

## 11. Implementation sketch

```
ROLE_WEIGHT = {
  "Project Lead":    4.0,
  "AI Design":       2.0,
  "Form / UX Design":2.0,
  "Data / Ops":      2.0,
  "Tester":          1.5,
  "Initiator":       2.0,   # Submitted instalment only
  "Observer":        0,     # never
}
INSTALMENT = { Submitted:4, In Review:2, Approved:2, In Progress:2, Pilot:3, Launched:3 }

on status change (idea, from → to):
    if `to` has already been awarded for this idea: stop
    instalment = INSTALMENT[to]                       # absent for On Hold / Declined
    if not instalment: stop

    for each member m of idea:
        roles = m.roles − {Observer}
        if to != Submitted: roles = roles − {Initiator}
        if roles is empty: skip m                     # earns nothing this instalment
        m.weight = max(ROLE_WEIGHT[r] for r in roles)
                 + min(0.5 × (len(roles) − 1), 1.0)

    denominator = max(sum of m.weight, 6)
    for each scoring member m:
        insert award(idea, m, stage=to, points = instalment × m.weight / denominator)

REQUEST_WEIGHT = { accepted:1.0, under_discussion:0.5, open:0.25, closed:0.25, declined:0.1 }

input pool for an idea (computed live, 4 points):
    for each person p who wrote a request on this idea:
        if p is the idea's Project Lead: skip
        p.weight = sum over their requests of
                     1.0 if r.accepted_at is not null
                     else REQUEST_WEIGHT[r.state]
        p.weight = min(p.weight, 2.0)

    denominator = max(sum of p.weight, 4)
    p's input share = 4 × p.weight / denominator

person's score =
      sum of their delivery awards
    + sum over ideas of their input share
```
