// main.js — starts the game and switches between screens.
//
// Screens: Title → Disclaimer (first time only) → Mode select → Episode
// select → Comic reader (with choices, Section Scans and the Case File
// drawer) → Ending. About is reached from the Title screen.
//
// All words come from the JSON files in content/. This file only decides
// what to show and when.

import { Game } from "./engine.js";
import { el, renderPanel, characterImage, speechBubble, withVersion } from "./renderer.js";
import { showScan } from "./scans.js";
import { setupDrawer, attachGame, updateCount } from "./casefiles.js";
import { loadProgress, saveProgress, resetProgress, storageAvailable, loadSound, saveSound, resetSound } from "./storage.js";
import * as speech from "./speech.js";
import * as music from "./music.js";

// Everything loaded from content/, filled in by start().
const data = { ui: null, characters: null, backgrounds: null, audio: null, episodes: {} };

// What the player is doing right now.
const state = {
  progress: null,
  mode: null, // "citizen" or "law"
  game: null,
  run: 0 // goes up each time an episode starts or is left, so old loops stop
};

const app = document.getElementById("app");
const hud = document.getElementById("hud");
const continueButton = document.getElementById("continue");

// ---------- Start-up ----------

async function loadJSON(path) {
  const response = await fetch(withVersion(path)); // the version number avoids stale copies
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

async function start() {
  try {
    data.ui = await loadJSON("content/ui.json");
    data.characters = (await loadJSON("content/characters.json")).characters;
    data.backgrounds = (await loadJSON("content/backgrounds.json")).backgrounds;
    data.audio = await loadJSON("content/audio.json");
    for (const info of data.ui.episodes) {
      if (info.playable) data.episodes[info.id] = await loadJSON(info.file);
    }
  } catch (error) {
    // Usually means index.html was double-clicked instead of opened through a web server.
    app.replaceChildren(
      el("p", "load-error", "The game files could not be loaded. Open the game through a local web server, not by double-clicking index.html.")
    );
    console.error(error);
    return;
  }

  state.progress = loadProgress();
  state.mode = state.progress.mode || null;
  document.title = data.ui.gameTitle;
  document.getElementById("exit-button").textContent = `✕ ${L().exit}`;
  document.getElementById("shield-label").textContent = L().dataShield;
  document.getElementById("casefile-label").textContent = L().caseFiles;
  setupDrawer(data.ui.labels);
  setupTapping();
  setupSound();
  showTitle();
}

// ---------- Helpers ----------

const L = () => data.ui.labels;

function button(text, onClick, className = "big-button") {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

// Swap the whole screen.
function showScreen(className, ...children) {
  state.run += 1; // stop any episode that was running
  speech.stop(true);
  music.setMood("calm");
  hud.hidden = true;
  continueButton.hidden = true;
  const screen = el("div", `screen ${className}`);
  screen.append(...children);
  app.replaceChildren(screen);
  window.scrollTo(0, 0);
  return screen;
}

function save() {
  state.progress.mode = state.mode;
  saveProgress(state.progress);
}

function showToast(text) {
  const toast = document.getElementById("toast");
  toast.textContent = text;
  toast.hidden = false;
  toast.classList.remove("show");
  void toast.offsetWidth; // restart the animation
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => (toast.hidden = true), 2600);
}

// ---------- Title, Disclaimer, Mode, Episodes, About ----------

function showTitle() {
  showScreen(
    "title-screen",
    el("h1", "game-title", data.ui.gameTitle),
    el("p", "tagline", data.ui.tagline),
    button(L().play, onPlay),
    button(L().about, showAbout, "big-button secondary")
  );
}

function onPlay() {
  if (!state.progress.disclaimerSeen) return showDisclaimer();
  if (!state.mode) return showModeSelect();
  showEpisodeSelect();
}

function showDisclaimer() {
  showScreen(
    "disclaimer-screen",
    el("div", "disclaimer-icon", "⚖️"),
    el("p", "disclaimer-text", data.ui.disclaimer),
    button(L().understand, () => {
      state.progress.disclaimerSeen = true;
      save();
      showModeSelect();
    })
  );
}

function showModeSelect() {
  const choices = el("div", "mode-list");
  for (const key of ["citizen", "law"]) {
    const mode = data.ui.modes[key];
    const card = el("button", `mode-card mode-${key}`);
    card.type = "button";
    card.appendChild(el("span", "mode-name", mode.name));
    card.appendChild(el("span", "mode-description", mode.description));
    card.addEventListener("click", () => {
      state.mode = key;
      save();
      showEpisodeSelect();
    });
    choices.appendChild(card);
  }
  showScreen(
    "mode-screen",
    el("h1", "screen-title", L().chooseMode),
    choices,
    button(L().back, showTitle, "text-button")
  );
}

function showEpisodeSelect() {
  const modeLine = el("div", "mode-line");
  modeLine.appendChild(el("span", "", `${L().mode}: ${data.ui.modes[state.mode].name}`));
  modeLine.appendChild(button(L().changeMode, showModeSelect, "text-button"));

  const list = el("div", "episode-list");
  for (const info of data.ui.episodes) {
    const title = info.playable ? data.episodes[info.id].title : info.title;
    const card = el(info.playable ? "button" : "div", info.playable ? "episode-card" : "episode-card locked");
    card.appendChild(el("span", "episode-number", `${L().episode} ${info.number}`));
    card.appendChild(el("span", "episode-title", title));

    if (info.playable) {
      card.type = "button";
      card.addEventListener("click", () => startEpisode(info.id));
      const saved = state.progress.episodes[info.id];
      if (saved && saved.completed) {
        card.appendChild(el("span", "episode-status", `✓ ${L().completed}`));
        for (const badgeTitle of saved.badges || []) card.appendChild(el("span", "badge small", badgeTitle));
      }
    } else {
      card.appendChild(el("span", "episode-status", L().comingSoon));
    }
    list.appendChild(card);
  }

  showScreen("episode-screen", el("h1", "screen-title", L().episodes), modeLine, list, button(L().back, showTitle, "text-button"));
}

function showAbout() {
  const screen = showScreen("about-screen", el("h1", "screen-title", L().about));
  for (const paragraph of data.ui.about.paragraphs) screen.appendChild(el("p", "about-text", paragraph));
  screen.appendChild(el("h2", "credits-title", L().musicCredits));
  const credits = el("ul", "credits-list");
  for (const track of data.audio.credits) credits.appendChild(el("li", "", `${track.title}, ${track.author} (${track.licence})`));
  screen.appendChild(credits);
  if (!storageAvailable()) screen.appendChild(el("p", "storage-note", L().storageOff));
  screen.appendChild(
    button(L().resetProgress, () => {
      if (!window.confirm(L().resetConfirm)) return;
      resetProgress();
      resetSound();
      applySound();
      state.progress = loadProgress();
      state.mode = null;
      showToast(L().resetDone);
    }, "big-button danger")
  );
  screen.appendChild(button(L().back, showTitle, "text-button"));
}

// ---------- Tapping through the comic ----------
// waitForTap() pauses the story until the player taps the Continue button,
// taps the comic, or presses Space / Enter / ↓.

let tapResolver = null;

function waitForTap() {
  continueButton.hidden = false;
  return new Promise((resolve) => (tapResolver = resolve));
}

function tap() {
  if (!tapResolver) return;
  const resolve = tapResolver;
  tapResolver = null;
  continueButton.hidden = true;
  speech.stop(); // clicking to continue cuts the current speech short
  resolve();
}

function setupTapping() {
  continueButton.textContent = L().tapToContinue;
  continueButton.addEventListener("click", tap);
  app.addEventListener("click", (event) => {
    if (event.target.closest("button")) return; // real buttons do their own thing
    if (event.target.closest(".reader")) tap();
  });
  document.addEventListener("keydown", (event) => {
    const overlayOpen = !document.getElementById("modal").hidden || !document.getElementById("drawer").hidden;
    if (overlayOpen || !tapResolver) return;
    if (event.key === " " || event.key === "ArrowDown" || (event.key === "Enter" && event.target === document.body)) {
      event.preventDefault();
      tap();
    }
  });
}

// ---------- Sound controls (read-aloud and music) ----------
// Saved settings: { readAloud, music, volume }. Read-aloud starts off; music starts on.

function soundSettings() {
  const saved = loadSound();
  return {
    readAloud: Boolean(saved.readAloud),
    music: saved.music !== false,
    volume: typeof saved.volume === "number" ? saved.volume : data.audio.music.defaultVolume
  };
}

// Make the buttons, slider, speech and music match the saved settings.
function applySound() {
  const sound = soundSettings();
  const readButton = document.getElementById("read-toggle");
  const musicButton = document.getElementById("music-toggle");
  const slider = document.getElementById("music-volume");
  readButton.setAttribute("aria-pressed", sound.readAloud);
  musicButton.setAttribute("aria-pressed", sound.music);
  slider.value = Math.round(sound.volume * 100);
  slider.disabled = !sound.music;
  document.body.classList.toggle("read-aloud-on", sound.readAloud);
  if (sound.readAloud !== speech.isOn()) speech.setOn(sound.readAloud);
  music.setOn(sound.music);
  music.setVolume(sound.volume);
}

function setupSound() {
  const readButton = document.getElementById("read-toggle");
  const musicButton = document.getElementById("music-toggle");
  const slider = document.getElementById("music-volume");
  readButton.textContent = `🔊 ${L().readAloud}`;
  musicButton.textContent = `🎵 ${L().music}`;
  slider.setAttribute("aria-label", L().musicVolume);
  readButton.hidden = !speech.supported;

  const sound = soundSettings();
  music.setupMusic(data.audio.music, sound.music, sound.volume);
  speech.setupSpeech(data.audio.voices, data.audio.voiceLists, music.duck);
  applySound();

  const change = (changes) => {
    saveSound({ ...soundSettings(), ...changes });
    applySound();
  };
  readButton.addEventListener("click", () => change({ readAloud: !soundSettings().readAloud }));
  musicButton.addEventListener("click", () => change({ music: !soundSettings().music }));
  slider.addEventListener("input", () => change({ volume: slider.value / 100 }));

  // Music waits for the first click or key press. This runs before the
  // click's own action, so turning music off with that first click stays silent.
  const firstInput = () => {
    music.begin();
    document.removeEventListener("click", firstInput, true);
    document.removeEventListener("keydown", firstInput, true);
  };
  document.addEventListener("click", firstInput, true);
  document.addEventListener("keydown", firstInput, true);
}

// The words on a panel that read-aloud reads: its caption and the lines showing so far.
function panelWords(panel, linesShown) {
  const words = [{ text: panel.caption }];
  for (const line of panel.lines.slice(0, linesShown)) words.push({ text: line.text, who: line.speaker });
  return words;
}

// A small button that reads the panel again. CSS hides it while read-aloud is off.
function addReplayButton(panelElement, panel, bubbles) {
  if (!speech.supported || (!panel.caption && !panel.lines.length)) return;
  const replay = button("🔊", () => {
    speech.speak(panelWords(panel, bubbles.filter((bubble) => !bubble.hidden).length));
  }, "replay-button");
  replay.setAttribute("aria-label", L().replayPanel);
  panelElement.querySelector(".panel-art").appendChild(replay);
}

// Which loop a scene uses (the list is in content/audio.json).
function moodFor(episodeId, sceneId) {
  const tense = data.audio.music.tenseScenes[episodeId] || [];
  return tense.includes(sceneId) ? "tense" : "calm";
}

// ---------- The Data Shield meter ----------

// The small "+10" / "-5" badge next to the meter. It only ever shows the
// change from the latest choice, then fades out and empties itself.
let deltaTimer = null;

function clearShieldDelta() {
  clearTimeout(deltaTimer);
  const delta = document.getElementById("shield-delta");
  delta.textContent = "";
  delta.className = "shield-delta";
}

function updateShield(change = 0) {
  const shield = state.game.shield;
  document.getElementById("shield-fill").style.width = `${shield}%`;
  document.getElementById("shield-value").textContent = shield;
  document.getElementById("shield-meter").setAttribute("aria-valuenow", shield);

  // Always wipe the previous badge first, so an old "+10" can never reappear.
  clearShieldDelta();
  if (change !== 0) {
    const delta = document.getElementById("shield-delta");
    delta.textContent = change > 0 ? `+${change}` : `${change}`;
    delta.className = change > 0 ? "shield-delta up" : "shield-delta down";
    void delta.offsetWidth; // restart the fade animation
    delta.classList.add("show");
    // Empty the badge once the 1.4s fade is over.
    deltaTimer = setTimeout(clearShieldDelta, 1500);
  }
}

// ---------- Playing an episode ----------

// Flags an episode reads from earlier episodes (Episode 6's "earlierFlags":
// flag → episode id). Each comes from that episode's latest saved playthrough;
// an episode that was never played simply adds nothing.
function earlierFlagsFor(episode) {
  const found = new Set();
  for (const [flag, fromEpisode] of Object.entries(episode.earlierFlags || {})) {
    const saved = state.progress.episodes[fromEpisode];
    if (saved && (saved.flags || []).includes(flag)) found.add(flag);
  }
  return found;
}

function startEpisode(episodeId) {
  const episode = data.episodes[episodeId];
  state.game = new Game(episode, state.mode, earlierFlagsFor(episode));
  attachGame(state.game);
  state.run += 1;
  hud.hidden = false;
  document.getElementById("hud-mode").textContent = data.ui.modes[state.mode].name;
  updateShield(); // also clears any badge left from the last run
  playScene(state.game.sceneId, state.run);
}

// A long phone screen (like Episode 3's breach notice) can be taller than
// the phone drawn in the panel. It still scrolls inside the phone, and this
// adds a small button that opens it full size so it's easy to read.
function addReadButton(panelElement) {
  const phone = panelElement.querySelector(".screen-holder > .phone");
  if (!phone || phone.scrollHeight <= phone.clientHeight + 1) return;
  const open = button(`🔍 ${L().readScreen}`, () => {
    const card = el("div", "scan-card screen-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", L().readScreen);
    card.appendChild(phone.cloneNode(true));
    const close = button(L().close, () => {
      modal.hidden = true;
      modal.replaceChildren();
      open.focus();
    });
    card.appendChild(close);
    const modal = document.getElementById("modal");
    modal.replaceChildren(card);
    modal.hidden = false;
    close.focus({ preventScroll: true }); // keep the screen's top in view
  }, "read-screen-button");
  panelElement.querySelector(".panel-art").appendChild(open);
}

// Show a scene's panels one tap at a time, then its Case Files, scans and choice.
async function playScene(sceneId, run) {
  const game = state.game;
  game.goTo(sceneId);
  const scene = game.scene;
  music.setMood(moodFor(game.episode.id, sceneId));

  hud.hidden = false;
  const reader = el("div", "reader");
  reader.appendChild(el("h2", "scene-title", scene.title));
  app.replaceChildren(reader);
  window.scrollTo(0, 0);

  for (const panel of game.panelsFor(sceneId)) {
    const { element, bubbles } = renderPanel(panel, { ...data, appScreens: game.episode.appScreens });
    reader.appendChild(element);
    addReadButton(element);
    addReplayButton(element, panel, bubbles);
    element.scrollIntoView({ behavior: "smooth", block: "start" });

    // The first bubble arrives with the panel; each tap shows the next one.
    // Read-aloud reads the caption with the first bubble, then each new bubble as it appears.
    if (!bubbles.length) speech.speak(panelWords(panel, 0));
    for (let i = 0; i < bubbles.length; i++) {
      if (i > 0) {
        await waitForTap();
        if (run !== state.run) return;
      }
      bubbles[i].hidden = false;
      bubbles[i].scrollIntoView({ behavior: "smooth", block: "nearest" });
      speech.speak(i === 0 ? panelWords(panel, 1) : [{ text: panel.lines[i].text, who: panel.lines[i].speaker }]);
    }
    await waitForTap();
    if (run !== state.run) return;
  }

  // Case Files unlock once, even if several scenes list them.
  // If two unlock together, one message lists both.
  const fresh = game.unlockCaseFiles(sceneId).map((id) => game.episode.caseFiles[id].title);
  if (fresh.length) showToast(`📁 ${L().newCaseFile}: ${fresh.join(" · ")}`);
  updateCount();

  // Section Scans: after the last panel, before the choice.
  for (const scan of game.scansAfter(sceneId)) {
    game.markScanShown(scan.id);
    await showScan(scan, game, L());
    if (run !== state.run) return;
  }

  const choice = game.currentChoice();
  if (choice) return showChoice(choice, reader, run);
  goNext(game.nextAfter(sceneId), run); // Episode 6: Law and Citizen part ways after Scene 6
}

function showChoice(choice, reader, run) {
  const box = el("div", "choice-box");
  box.appendChild(el("p", "choice-heading", L().whatNext));
  if (choice.description) box.appendChild(el("p", "choice-note", choice.description));

  for (const option of state.game.availableOptions(choice)) {
    box.appendChild(
      button(option.label, () => {
        box.querySelectorAll("button").forEach((b) => (b.disabled = true));
        const result = state.game.choose(option);
        updateShield(result.change);
        goNext(result.next, run);
      }, "choice-button")
    );
  }
  reader.appendChild(box);
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  box.querySelector("button").focus({ preventScroll: true });
}

function goNext(next, run) {
  if (run !== state.run) return;
  if (next === "ending") return showEnding();
  // A short pause so the player sees the Shield change.
  setTimeout(() => {
    if (run === state.run) playScene(next, run);
  }, 450);
}

// ---------- Ending ----------

function showEnding() {
  const game = state.game;
  const ending = game.ending();
  const badges = game.badges();
  const episodeId = game.episode.id;

  // Save progress: completed, every badge ever earned, and this run's flags for Episode 6.
  const saved = state.progress.episodes[episodeId] || { badges: [] };
  const allBadges = new Set([...(saved.badges || []), ...badges.map((badge) => badge.title)]);
  state.progress.episodes[episodeId] = {
    completed: true,
    badges: [...allBadges],
    flags: [...game.flags],
    lastEnding: ending ? ending.id : null,
    lastShield: game.shield,
    lastCitation: game.mode === "law" ? { correct: game.lawScansCorrect, seen: game.lawScansSeen } : null
  };
  save();

  const screen = showScreen("ending-screen");
  music.playSting();
  screen.appendChild(el("p", "ending-kicker", L().theEnd));

  if (ending) {
    screen.appendChild(el("h1", "ending-title", ending.title));
    if (ending.caption) screen.appendChild(el("div", "caption-box ending-caption", ending.caption));
    if (ending.lines.length) {
      const scene = el("div", "ending-speaker");
      for (const member of ending.characters) scene.appendChild(characterImage(data.characters, member.id, member.expression));
      screen.appendChild(scene);
      for (const line of ending.lines) screen.appendChild(speechBubble(line, data.characters, 50));
    }
    if (ending.card) {
      const card = el("div", "lesson-card");
      card.appendChild(el("h2", "lesson-title", ending.card.title));
      const list = el("ol", "lesson-list");
      for (const item of ending.card.items) list.appendChild(el("li", "", item));
      card.appendChild(list);
      screen.appendChild(card);
    }
  }

  // Scores and badges.
  const scores = el("div", "score-box");
  const shieldRow = el("div", "score-row");
  shieldRow.appendChild(el("span", "", `🛡️ ${L().dataShield}`));
  shieldRow.appendChild(el("strong", "", `${game.shield} / 100`));
  scores.appendChild(shieldRow);
  if (game.mode === "law") {
    const lawRow = el("div", "score-row");
    lawRow.appendChild(el("span", "", `⚖️ ${L().citationScore}`));
    lawRow.appendChild(el("strong", "", `${game.lawScansCorrect} / ${game.lawScansSeen}`));
    scores.appendChild(lawRow);
  }
  scores.appendChild(el("p", "badges-heading", L().badges));
  if (badges.length === 0) scores.appendChild(el("p", "no-badges", L().noBadges));
  for (const badge of badges) scores.appendChild(el("span", "badge", `🏅 ${badge.title}`));
  screen.appendChild(scores);

  // The finale (Episode 6) goes on to the "Your Data Story" card instead.
  if (game.episode.storyCard) {
    screen.appendChild(button(L().continue, () => showStoryCard(game.episode)));
    return;
  }
  screen.appendChild(button(L().replay, () => startEpisode(episodeId)));
  screen.appendChild(button(L().backToEpisodes, showEpisodeSelect, "big-button secondary"));
}

// ---------- "Your Data Story" (after Episode 6) ----------
// One row per episode: its title, the ending reached, the final Shield and
// the badges earned, all from saved progress. Unplayed episodes say so.

function showStoryCard(finale) {
  const words = finale.storyCard;
  const card = el("div", "story-card");
  card.appendChild(el("h1", "story-card-title", words.title));

  for (const info of data.ui.episodes) {
    const episode = data.episodes[info.id];
    const row = el("section", "story-row");
    row.appendChild(el("p", "episode-number", `${L().episode} ${info.number}`));
    row.appendChild(el("h2", "story-row-title", episode ? episode.title : info.title));

    const saved = episode && state.progress.episodes[info.id];
    if (!saved || !saved.completed) {
      row.classList.add("not-played");
      row.appendChild(el("p", "story-row-status", words.notPlayed));
    } else {
      const ending = episode.endings.find((item) => item.id === saved.lastEnding);
      if (ending) row.appendChild(el("p", "story-row-ending", ending.title));
      row.appendChild(el("p", "story-row-shield", `🛡️ ${L().dataShield}: ${saved.lastShield} / 100`));
      const badges = el("div", "story-row-badges");
      for (const title of saved.badges || []) badges.appendChild(el("span", "badge small", title));
      if (badges.childElementCount) row.appendChild(badges);
    }
    card.appendChild(row);
  }

  const screen = showScreen("story-screen", card);
  screen.appendChild(button(words.replay, () => startEpisode(finale.id)));
  screen.appendChild(button(L().backToEpisodes, showEpisodeSelect, "big-button secondary"));
}

// ---------- Exit button in the top bar ----------

document.getElementById("exit-button").addEventListener("click", () => {
  if (window.confirm(L().exitConfirm)) showEpisodeSelect();
});

start();
