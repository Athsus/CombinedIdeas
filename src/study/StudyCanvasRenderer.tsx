import { useMemo, useState } from "react";
import type { StudyCanvasDsl, StudyFlashCard } from "./dsl";

type Props = {
  dsl: StudyCanvasDsl;
};

type CardProgress = Record<string, "known" | "again" | null>;

function FlashCardDeck({ cards }: { cards: StudyFlashCard[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [progress, setProgress] = useState<CardProgress>({});

  const activeCard = cards[activeIndex];

  const doneCount = useMemo(
    () => cards.filter((card) => progress[card.id] === "known").length,
    [cards, progress],
  );

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
    setProgress((prev) => ({
      ...prev,
      [activeCard.id]: status,
    }));

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

export function StudyCanvasRenderer({ dsl }: Props) {
  return (
    <div className="study-canvas">
      <div className="study-canvas-header">
        <p className="eyebrow">Generated Study Canvas</p>
        <h2>{dsl.title}</h2>
        <p>{dsl.summary}</p>
      </div>
      {dsl.modules.map((module) => (
        <section key={module.title} className="study-module">
          <header>
            <h3>{module.title}</h3>
            <p>{module.description}</p>
          </header>
          {module.type === "flashcards" ? <FlashCardDeck cards={module.cards} /> : null}
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
