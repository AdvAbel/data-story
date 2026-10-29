// casefiles.js — the Case File drawer that slides up from the bottom.
//
// It only lists Case Files the player has unlocked. Citizen mode shows the
// plain explainer; Law mode also shows the law detail. The "Rules apply
// from" line is hidden when a Case File has no date (CF4, CF6, CF7).

import { el } from "./renderer.js";

let current = { game: null, labels: null };

const drawer = () => document.getElementById("drawer");
const button = () => document.getElementById("casefile-button");

export function setupDrawer(labels) {
  current.labels = labels;
  button().addEventListener("click", openDrawer);
  drawer().addEventListener("click", (event) => {
    // Tapping the dark area outside the sheet closes it.
    if (event.target === drawer()) closeDrawer();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !drawer().hidden) closeDrawer();
  });
}

// Called when an episode starts, and whenever new files unlock.
export function attachGame(game) {
  current.game = game;
  updateCount();
}

export function updateCount() {
  const count = current.game ? current.game.unlockedCaseFiles.length : 0;
  document.getElementById("casefile-count").textContent = count;
}

export function openDrawer() {
  const { game, labels } = current;
  if (!game) return;

  const sheet = el("div", "drawer-sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", labels.caseFiles);

  const top = el("div", "drawer-top");
  top.appendChild(el("h2", "drawer-title", `📁 ${labels.caseFiles}`));
  const close = el("button", "drawer-close", labels.close);
  close.type = "button";
  close.addEventListener("click", closeDrawer);
  top.appendChild(close);
  sheet.appendChild(top);

  const list = el("div", "drawer-list");
  if (game.unlockedCaseFiles.length === 0) {
    list.appendChild(el("p", "drawer-empty", labels.noCaseFiles));
  }
  for (const id of game.unlockedCaseFiles) {
    const file = game.episode.caseFiles[id];
    const card = el("article", "casefile");
    card.appendChild(el("p", "casefile-id", id));
    card.appendChild(el("h3", "casefile-title", file.title));
    card.appendChild(el("p", "casefile-plain", file.plain));
    if (game.mode === "law") {
      const law = el("p", "casefile-law");
      law.appendChild(el("strong", "", `${labels.theLaw}: `));
      law.appendChild(document.createTextNode(file.law));
      card.appendChild(law);
    }
    if (file.inForce) {
      card.appendChild(el("p", "casefile-date", `${labels.rulesApplyFrom}: ${file.inForce}`));
    }
    // Practical help shown in both modes (Episode 3's CF15), with its source.
    if (file.help) {
      const help = el("div", "casefile-help");
      help.appendChild(el("p", "casefile-help-title", file.help.title));
      const text = el("p", "casefile-help-text", `${file.help.text} (`);
      const source = el("a", "", file.help.source);
      source.href = file.help.url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      text.append(source, ").");
      help.appendChild(text);
      card.appendChild(help);
    }
    list.appendChild(card);
  }
  sheet.appendChild(list);

  drawer().replaceChildren(sheet);
  drawer().hidden = false;
  // Next frame, so the slide-up animation runs.
  requestAnimationFrame(() => drawer().classList.add("open"));
  close.focus();
}

export function closeDrawer() {
  drawer().classList.remove("open");
  drawer().hidden = true;
  drawer().replaceChildren();
  button().focus();
}
