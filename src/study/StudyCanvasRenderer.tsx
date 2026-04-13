import { useMemo, useState } from "react";
import type { FlashControlAction, FlashCardsModule, QuizQuestion, StudyCanvasDsl, StudyFlashCard, StudyPlanSession } from "./dsl";

type Props = {
  dsl: StudyCanvasDsl;
};

type CardProgress = Record<string, "known" | "again" | null>;

const CARD_MODE_LABELS: Record<StudyFlashCard["mode"], string> = {
  concept: "Concept",
  compare: "Compare",
  process: "Process",
  application: "Application",
};

function FlashCardDeck({ cards, controls }: { cards: StudyFlashCard[]; controls: FlashCardsModule["controls"] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [progress, setProgress] = useState<CardProgress>({});
  const activeCard = cards[activeIndex];

  const doneCount = useMemo(() => cards.filter((card) => progress[card.id] === "known").length, [cards, progress]);

  function moveTo(index: number) {
    setActiveIndex(index);
    setIsFlipped(false);
  }

  function nextCard() {
    moveTo((activeIndex + 1) % cards.length);
  }

  function prevCard() {
    moveTo((activeIndex - 1 + cards.length) % cards.length);
  }

  function markCard(status: "known" | "again") {
    setProgress((prev) => ({ ...prev, [activeCard.id]: status }));
    nextCard();
  }

  function triggerControl(action: FlashControlAction) {
    if (action === "prev_card") {
      prevCard();
      return;
    }

    if (action === "next_card") {
      nextCard();
      return;
    }

    if (action === "flip_card") {
      setIsFlipped((current) => !current);
      return;
    }

    if (action === "mark_known") {
      markCard("known");
      return;
    }

    markCard("again");
  }

  return (
    <div className="study-deck">
      <div className="study-deck-top">
        <p>
          Card {activeIndex + 1} / {cards.length}
        </p>
        <p>{doneCount} known</p>
      </div>
      <button className={`flash-card ${isFlipped ? "flipped" : ""}`} type="button" onClick={() => setIsFlipped((current) => !current)}>
        <div className="flash-side front">
          <div className="flash-card-meta">
            <span className="flash-chip">{CARD_MODE_LABELS[activeCard.mode]}</span>
            <span className={`flash-chip difficulty-${activeCard.difficulty}`}>{activeCard.difficulty}</span>
          </div>
          <h4>{activeCard.label}</h4>
          <p>{activeCard.prompt}</p>
        </div>
        <div className="flash-side back">
          <h4>{activeCard.label}</h4>
          <div className="flash-section">
            <span>Answer</span>
            <p>{activeCard.answer}</p>
          </div>
          <div className="flash-section">
            <span>Example</span>
            <p>{activeCard.example}</p>
          </div>
          <div className="flash-section">
            <span>Checkpoint</span>
            <p>{activeCard.checkpoint}</p>
          </div>
          <div className="flash-sources">
            {activeCard.sourceRefs.map((source) => (
              <span key={`${activeCard.id}-${source}`} className="source-chip">
                {source}
              </span>
            ))}
          </div>
        </div>
      </button>
      {(controls ?? []).length > 0 ? (
        <div className="study-deck-controls">
          {(controls ?? []).map((control, index) => (
            <button
              key={`${control.action}-${index}`}
              type="button"
              className={["button", control.style === "primary" ? "" : control.style].filter(Boolean).join(" ")}
              onClick={() => triggerControl(control.action)}
            >
              {control.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QuizPanel({ questions }: { questions: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  return (
    <div className="quiz-panel">
      {questions.map((question) => {
        const selected = answers[question.id] ?? null;
        const isCorrect = selected === question.answerIndex;

        return (
          <article key={question.id} className="quiz-question">
            <p className="quiz-prompt">{question.prompt}</p>
            <div className="quiz-options">
              {question.options.map((option, index) => (
                <button
                  key={`${question.id}-${option}`}
                  type="button"
                  className={`quiz-option ${selected === index ? "selected" : ""}`}
                  onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: index }))}
                >
                  {option}
                </button>
              ))}
            </div>
            {selected !== null ? (
              <p className={`quiz-result ${isCorrect ? "good" : "bad"}`}>
                {isCorrect ? "Correct" : "Review"}: {question.explanation}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function StudyPlanPanel({ sessions }: { sessions: StudyPlanSession[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});

  return (
    <div className="plan-panel">
      {sessions.map((session) => (
        <article key={session.id} className="plan-session">
          <header>
            <h4>{session.day}</h4>
            <p>{session.focus}</p>
          </header>
          <ul>
            {session.tasks.map((task, index) => {
              const taskId = `${session.id}-${index}`;
              const checked = done[taskId] ?? false;

              return (
                <li key={taskId}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => setDone((prev) => ({ ...prev, [taskId]: event.target.checked }))}
                    />
                    <span>{task}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </div>
  );
}

export function StudyCanvasRenderer({ dsl }: Props) {
  return (
    <div className="study-canvas">
      <div className="study-canvas-header">
        <p className="eyebrow">Interactive Canvas</p>
        <h2>{dsl.title}</h2>
        <p>{dsl.summary}</p>
        <p className="small-note">Rendering Rule v1: fixed layout blocks, AI-generated card content only.</p>
      </div>
      {dsl.modules.map((module, index) => (
        <section key={`${module.type}-${index}`} className="study-module">
          <header>
            <h3>{module.title}</h3>
            <p>{module.description}</p>
          </header>
          {module.type === "flashcards" ? <FlashCardDeck cards={module.cards} controls={module.controls ?? []} /> : null}
          {module.type === "quiz" ? <QuizPanel questions={module.questions} /> : null}
          {module.type === "study_plan" ? <StudyPlanPanel sessions={module.sessions} /> : null}
        </section>
      ))}
      {dsl.actions.length > 0 ? (
        <div className="study-actions">
          {dsl.actions.map((action) => (
            <span key={action} className="study-action-pill">
              {action}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
