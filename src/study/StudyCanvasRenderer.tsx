import { useMemo, useState } from "react";
import type { QuizQuestion, StudyCanvasDsl, StudyFlashCard, StudyPlanSession } from "./dsl";

type Props = {
  dsl: StudyCanvasDsl;
};

type CardProgress = Record<string, "known" | "again" | null>;

function FlashCardDeck({ cards }: { cards: StudyFlashCard[] }) {
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

  return (
    <div className="study-deck">
      <div className="study-deck-top">
        <p>
          Card {activeIndex + 1} / {cards.length}
        </p>
        <p>{doneCount} known</p>
      </div>
      <button className={`flash-card ${isFlipped ? "flipped" : ""}`} type="button" onClick={() => setIsFlipped((current) => !current)}>
        <span className="flash-side front">{activeCard.front}</span>
        <span className="flash-side back">{activeCard.back}</span>
      </button>
      {activeCard.hint ? <p className="flash-hint">Hint: {activeCard.hint}</p> : null}
      <div className="study-deck-controls">
        <button type="button" className="button secondary" onClick={prevCard}>
          Previous
        </button>
        <button type="button" className="button secondary" onClick={nextCard}>
          Skip
        </button>
        <button type="button" className="button" onClick={() => markCard("again")}>
          Review Again
        </button>
        <button type="button" className="button" onClick={() => markCard("known")}>
          I Know This
        </button>
      </div>
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
      </div>
      {dsl.modules.map((module, index) => (
        <section key={`${module.type}-${index}`} className="study-module">
          <header>
            <h3>{module.title}</h3>
            <p>{module.description}</p>
          </header>
          {module.type === "flashcards" ? <FlashCardDeck cards={module.cards} /> : null}
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
