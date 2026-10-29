// scans.js — the Section Scan pop-up cards.
//
// Citizen scans (mode "both"): pick an answer, then see whether it was right
// and the one-line explanation.
// Law scans (mode "law"): pick a short answer, then the model answer always
// shows; a correct short answer earns one citation point.

import { el } from "./renderer.js";

const modal = () => document.getElementById("modal");

// Show one scan and wait until the player taps Continue.
export function showScan(scan, game, labels) {
  return new Promise((resolve) => {
    const isLaw = scan.mode === "law";
    const card = el("div", isLaw ? "scan-card law-scan" : "scan-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "scan-question");

    card.appendChild(el("p", "scan-kicker", `${isLaw ? labels.lawScan : labels.citizenScan} · ${scan.id}`));
    const question = el("h2", "scan-question", scan.question);
    question.id = "scan-question";
    card.appendChild(question);

    const optionTexts = isLaw ? scan.shortAnswerOptions : scan.options;
    const optionList = el("div", "scan-options");
    const buttons = optionTexts.map((text, index) => {
      const button = el("button", "scan-option", text);
      button.type = "button";
      button.addEventListener("click", () => answer(index));
      optionList.appendChild(button);
      return button;
    });
    card.appendChild(optionList);

    const result = el("div", "scan-result");
    result.setAttribute("aria-live", "polite");
    card.appendChild(result);

    function answer(index) {
      const correct = index === scan.correct;
      if (isLaw) game.answerLawScan(scan, index);

      // Lock the options and colour the right and chosen answers.
      buttons.forEach((button, i) => {
        button.disabled = true;
        if (i === scan.correct) button.classList.add("is-correct");
        else if (i === index) button.classList.add("is-wrong");
      });

      result.appendChild(el("p", correct ? "verdict good" : "verdict bad", correct ? labels.correct : labels.notQuite));
      if (isLaw) {
        if (correct) result.appendChild(el("p", "citation-point", labels.citationPoint));
        result.appendChild(el("p", "model-answer-label", labels.modelAnswer));
        result.appendChild(el("p", "model-answer", scan.modelAnswer));
      } else {
        result.appendChild(el("p", "explanation", scan.explanation));
      }

      const next = el("button", "big-button", labels.continue);
      next.type = "button";
      next.addEventListener("click", () => {
        modal().hidden = true;
        modal().replaceChildren();
        resolve();
      });
      result.appendChild(next);
      next.focus();
    }

    modal().replaceChildren(card);
    modal().hidden = false;
    card.scrollTop = 0;
    buttons[0].focus();
  });
}
