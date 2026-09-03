"use client";

// Course wrap-up: /learning/journey/[courseId]/quiz — one question per
// card, Salesforce-Trailhead style. Click any option to check it against
// course_quiz_questions.correct_answer; wrong just says so and stays
// clickable (no attempt limit, and every other option stays clickable too —
// there's no locking once the right one's been found, matching how the quiz
// data itself was scoped: no attempts table, nothing recorded per click).
// Getting a question right reveals its rationale and unlocks Next. The only
// lasting effect of the whole quiz is course_assignments.status flipping to
// 'complete' once the last question's been answered correctly — there's no
// score or attempt history stored anywhere.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import { card, errBanner } from "@/features/learning/shared";

const CORRECT = { bg: "#e6f4ea", border: "#bfe3c9", color: "#1f7a3c" };
const INCORRECT = { bg: "#fff4f4", border: "#ffc9c9", color: "#c92a2a" };

// Highlight rule: whichever option was clicked most recently shows its own
// correct/incorrect color. Once the right answer's been found for this
// question (revealedCorrect), that option stays marked green even after a
// later click lands on a wrong one — otherwise "click each answer to check"
// would make the answer you already found disappear again.
function OptionButton({ option, selectedLabel, correctAnswer, revealedCorrect, onClick }) {
  const isSelected = selectedLabel === option.label;
  const isCorrectOption = option.label === correctAnswer;
  const palette = isSelected
    ? (isCorrectOption ? CORRECT : INCORRECT)
    : (revealedCorrect && isCorrectOption ? CORRECT : null);

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, width: "100%", textAlign: "left",
        border: `1px solid ${palette ? palette.border : "var(--line)"}`,
        background: palette ? palette.bg : "var(--card)",
        borderRadius: 10, padding: "12px 14px", fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
      }}
    >
      <span style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11.5, fontWeight: 700, background: palette ? palette.color : "var(--bg)", color: palette ? "#fff" : "var(--muted)",
      }}>
        {option.label}
      </span>
      <span style={{ flex: 1, paddingTop: 1, color: palette ? palette.color : "var(--body)", fontWeight: palette ? 700 : 400 }}>
        {option.text}
      </span>
    </button>
  );
}

// One green pip per question already answered correctly, a blue one for
// the current question, gray for the rest — a Trailhead-style progress row.
function ProgressPips({ questions, answers, currentIndex }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
      {questions.map((q, i) => (
        <div
          key={q.id}
          title={`Question ${i + 1}`}
          style={{
            width: 22, height: 6, borderRadius: 999,
            background: answers[q.id]?.revealedCorrect ? "#1f7a3c" : i === currentIndex ? "var(--blue)" : "var(--line)",
          }}
        />
      ))}
    </div>
  );
}

function QuestionCard({ question, index, total, answer, onAnswer, onNext, isLast, advancing }) {
  const revealedCorrect = !!answer?.revealedCorrect;
  const selectedLabel = answer?.selected || null;
  const feedback = !selectedLabel ? null
    : selectedLabel === question.correct_answer
      ? { text: "Correct!", color: "#1f7a3c" }
      : { text: "Incorrect — try another option.", color: "#c92a2a" };

  return (
    <section style={card}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
        Question {index + 1} of {total}
      </div>
      <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 18, lineHeight: 1.4 }}>
        {question.question}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {question.options.map((opt) => (
          <OptionButton
            key={opt.label}
            option={opt}
            selectedLabel={selectedLabel}
            correctAnswer={question.correct_answer}
            revealedCorrect={revealedCorrect}
            onClick={() => onAnswer(opt.label)}
          />
        ))}
      </div>
      {feedback && <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: feedback.color }}>{feedback.text}</div>}
      {revealedCorrect && (
        <div style={{ marginTop: 10, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", fontSize: 12.5, color: "var(--body)", lineHeight: 1.5 }}>
          <strong style={{ color: "var(--ink)" }}>Why: </strong>{question.rationale}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button
          onClick={onNext}
          disabled={!revealedCorrect || advancing}
          style={{
            border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700,
            background: revealedCorrect ? "var(--blue)" : "var(--line)", color: revealedCorrect ? "#fff" : "var(--muted)",
            cursor: revealedCorrect && !advancing ? "pointer" : "not-allowed",
          }}
        >
          {advancing ? "Finishing…" : isLast ? "Finish" : "Next question →"}
        </button>
      </div>
    </section>
  );
}

// Skedulo brand blues + the green already used everywhere for "complete"
// status, plus two warm accents for festivity — five colors is enough
// variety without straying from the palette the rest of the app uses.
const CONFETTI_COLORS = ["#0055ff", "#007ee6", "#1f7a3c", "#f4b400", "#ff6b6b"];

// Full-viewport, not scoped to the completion card — a burst confined to a
// small card reads as a scribble, not a celebration. pointer-events: none
// and aria-hidden so it never gets in the way of the real content behind
// it. Pieces are generated once per mount (lazy useState initializer) so
// re-renders don't restart the fall mid-animation.
function Confetti({ count = 48 }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      round: i % 3 === 0,
      fallY: 360 + Math.random() * 200,
      driftX: (Math.random() - 0.5) * 180,
      spin: (360 + Math.random() * 540) * (Math.random() < 0.5 ? -1 : 1),
      delay: Math.random() * 450,
      duration: 2000 + Math.random() * 900,
    }))
  );
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 300 }}>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            borderRadius: p.round ? "50%" : 2,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
            "--fall-y": `${p.fallY}px`,
            "--drift-x": `${p.driftX}px`,
            "--spin": `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}

const completionBtn = { display: "inline-block", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, textDecoration: "none" };

// correct/total: the same first-try snapshot the completion write itself
// sent (QuizPage's handleNext) — shown here so finishing feels like it
// actually counted for something, not just a silent status flip. Confetti
// auto-clears itself after its longest piece finishes falling, so it
// doesn't sit in the DOM (invisible but present) indefinitely.
function CompletionCard({ courseTitle, correct, total }) {
  const [celebrating, setCelebrating] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setCelebrating(false), 3200);
    return () => clearTimeout(t);
  }, []);
  const hasScore = total != null && total > 0;

  return (
    <>
      {celebrating && <Confetti />}
      <section className="celebrate-pop" style={{ ...card, textAlign: "center", padding: "40px 24px" }}>
        <div className="celebrate-icon" style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
        <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 19, color: "var(--ink)", marginBottom: 6 }}>
          Nice work — course complete!
        </div>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 4px" }}>
          "{courseTitle}" is now marked complete on your journey.
        </p>
        {hasScore && (
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 22px" }}>
            {correct} of {total} correct on the first try · {Math.round((correct / total) * 100)}%
          </p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: hasScore ? 0 : 20 }}>
          <Link href="/learning/journey" style={{ ...completionBtn, background: "var(--blue)", color: "#fff" }}>
            Back to Your Journey
          </Link>
          <Link href="/learning/dashboard" style={{ ...completionBtn, border: "1px solid var(--line)", background: "var(--card)", color: "var(--body)" }}>
            View your progress
          </Link>
        </div>
      </section>
    </>
  );
}

export default function QuizPage() {
  const { courseId } = useParams();
  const { user: me } = useSession();
  const [course, setCourse] = useState(null);
  const [questions, setQuestions] = useState([]);
  // questionId -> { selected: 'B', revealedCorrect: true, firstTryCorrect: false }.
  // revealedCorrect is sticky (never flips back to false once true) so Next
  // stays unlocked and the rationale stays visible even if a later click
  // lands on a wrong option out of curiosity. firstTryCorrect is set once,
  // on the first click for that question, and never touched again — it's
  // the accuracy this course's completion gets recorded with.
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null); // { correct, total } — set alongside done, for CompletionCard's score line

  useEffect(() => {
    if (!me) return;
    let live = true;
    (async () => {
      setErr("");
      try {
        const data = await api(`/api/courses/${courseId}/quiz`);
        if (!live) return;
        setCourse(data);
        setQuestions(data.questions || []);
      } catch (e) {
        if (live) setErr(e.message);
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => { live = false; };
  }, [me, courseId]);

  const current = questions[index];

  const handleAnswer = (label) => {
    if (!current) return;
    setAnswers((prev) => {
      const prevEntry = prev[current.id];
      const isCorrect = label === current.correct_answer;
      return {
        ...prev,
        [current.id]: {
          selected: label,
          revealedCorrect: !!prevEntry?.revealedCorrect || isCorrect,
          // Only ever set on the FIRST click for this question — later
          // clicks (right or wrong) don't change what "first try" was.
          firstTryCorrect: prevEntry ? prevEntry.firstTryCorrect : isCorrect,
        },
      };
    });
  };

  // Next just advances locally; on the last question (button already
  // requires revealedCorrect to be enabled) it instead marks the course
  // complete, sending how many questions were right on the first click —
  // a one-time snapshot, not a growing attempt log. A failed complete-call
  // leaves revealedCorrect untouched, so the button re-enables for a retry.
  const handleNext = async () => {
    if (index < questions.length - 1) { setIndex((i) => i + 1); return; }
    setFinishing(true);
    setErr("");
    try {
      const total = questions.length;
      const correct = questions.filter((q) => answers[q.id]?.firstTryCorrect).length;
      await api(`/api/courses/${courseId}/complete`, { method: "POST", body: JSON.stringify({ correct, total }) });
      setResult({ correct, total });
      setDone(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb={course?.title ? `${course.title} · Wrap-up` : "Wrap-up"} />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined || (me && !ready) ? (
          <Loading label="Loading quiz" />
        ) : (
          <>
            <Link href="/learning/journey" style={{ fontSize: 12.5, color: "var(--muted)", textDecoration: "none", display: "inline-block", marginBottom: 14 }}>
              ← Back to Your Journey
            </Link>
            {err && <div style={{ ...errBanner, marginBottom: 14 }}>{err}</div>}
            {done ? (
              <CompletionCard courseTitle={course?.title} correct={result?.correct} total={result?.total} />
            ) : !course ? null : questions.length === 0 ? (
              <section style={card}>
                <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16, color: "var(--ink)", marginBottom: 6 }}>{course.title}</div>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>No quiz for this course yet — check back soon.</p>
              </section>
            ) : (
              <>
                <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)", marginBottom: 4 }}>{course.title}</div>
                {course.status === "complete" && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>You've already completed this course — feel free to retake the quiz.</div>
                )}
                <ProgressPips questions={questions} answers={answers} currentIndex={index} />
                <QuestionCard
                  question={current}
                  index={index}
                  total={questions.length}
                  answer={answers[current.id]}
                  onAnswer={handleAnswer}
                  onNext={handleNext}
                  isLast={index === questions.length - 1}
                  advancing={finishing}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
