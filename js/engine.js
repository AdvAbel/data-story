// engine.js — the rules of the game, with no drawing code.
//
// A Game object remembers one playthrough: the current scene, the Data
// Shield, the flags, which Case Files are unlocked, which scans were shown,
// and the Law citation score. The screens in main.js ask it questions
// ("which scans come next?", "which options can I show?") and tell it what
// the player chose.

const SHIELD_MIN = 0;
const SHIELD_MAX = 100;

export class Game {
  // episode: the parsed episode JSON. mode: "citizen" or "law".
  // earlierFlags: flags saved from earlier episodes (Episode 6 reads these to
  // choose panels). They never count towards this episode's endings or badges.
  constructor(episode, mode, earlierFlags = new Set()) {
    this.episode = episode;
    this.mode = mode;
    this.earlierFlags = earlierFlags;
    this.sceneId = episode.startScene;
    this.shield = episode.shieldStart;
    this.flags = new Set();
    this.unlockedCaseFiles = []; // in unlock order
    this.usedOptions = new Set(); // options removed after use, e.g. D1
    this.shownScans = new Set(); // each scan shows once per playthrough
    this.lawScansSeen = 0;
    this.lawScansCorrect = 0;
    this.visitedScenes = new Set([this.sceneId]); // for badges like "reached Scene 4"
  }

  get scene() {
    return this.episode.scenes[this.sceneId];
  }

  // Is this flag set, either in this playthrough or in an earlier episode?
  // Only used to choose panels. A flag that was never saved counts as not set.
  panelFlag(flag) {
    return this.flags.has(flag) || this.earlierFlags.has(flag);
  }

  // The panels to show for a scene. A panel can say:
  //   "showIfFlag": only when that flag is set (Episode 3's P5.0)
  //   "showIfNotFlag": only when that flag is NOT set (Episode 6's "if not" panels)
  //   "showInMode": only in that mode (Episode 6's P8.2 is Law only)
  // Where a panel has an "if" and an "if not" version, exactly one shows.
  panelsFor(sceneId) {
    return this.episode.scenes[sceneId].panels.filter(
      (panel) =>
        (!panel.showIfFlag || this.panelFlag(panel.showIfFlag)) &&
        (!panel.showIfNotFlag || !this.panelFlag(panel.showIfNotFlag)) &&
        (!panel.showInMode || panel.showInMode === this.mode)
    );
  }

  // Where to go after a scene that has no choice. Episode 6's Scene 6 uses
  // "nextByMode": Law mode goes to Scene 7, Citizen mode straight to Scene 8.
  nextAfter(sceneId) {
    const scene = this.episode.scenes[sceneId];
    return scene.nextByMode ? scene.nextByMode[this.mode] : scene.next;
  }

  // Keep the Shield between 0 and 100.
  changeShield(amount) {
    this.shield = Math.min(SHIELD_MAX, Math.max(SHIELD_MIN, this.shield + amount));
  }

  // Unlock this scene's Case Files. Returns only the ones that are new,
  // so a Case File listed by two scenes unlocks once.
  unlockCaseFiles(sceneId) {
    const fresh = [];
    for (const id of this.episode.scenes[sceneId].unlocks || []) {
      if (!this.unlockedCaseFiles.includes(id)) {
        this.unlockedCaseFiles.push(id);
        fresh.push(id);
      }
    }
    return fresh;
  }

  // Scans to show after a scene, in the order they appear in the JSON.
  // Citizen mode skips Law scans; any scan already shown is skipped.
  scansAfter(sceneId) {
    const list = [];
    for (const [id, scan] of Object.entries(this.episode.scans)) {
      if (!scan.afterScenes.includes(sceneId)) continue;
      if (scan.mode === "law" && this.mode !== "law") continue;
      if (this.shownScans.has(id)) continue;
      list.push({ id, ...scan });
    }
    return list;
  }

  markScanShown(id) {
    this.shownScans.add(id);
  }

  // Record a Law scan answer. Returns true if it was correct.
  answerLawScan(scan, answerIndex) {
    const correct = answerIndex === scan.correct;
    this.lawScansSeen += 1;
    if (correct) this.lawScansCorrect += 1;
    return correct;
  }

  // The choice to show for the current scene, or null if the scene just
  // moves on. Scene 5A has no choice of its own: it sends the player back
  // to Scene 5's choice ("returnToChoiceOf").
  currentChoice() {
    const scene = this.scene;
    if (scene.returnToChoiceOf) return this.episode.scenes[scene.returnToChoiceOf].choice;
    return scene.choice || null;
  }

  // The options the player can still pick (D1 disappears once used).
  availableOptions(choice) {
    return choice.options.filter((option) => !this.usedOptions.has(option.id));
  }

  // Apply a chosen option. Returns how much the Shield changed.
  choose(option) {
    // C5: the +10 only counts if the flag named here is NOT already set.
    let amount = option.shield;
    if (option.shieldIfMissingFlag && this.flags.has(option.shieldIfMissingFlag)) amount = 0;

    const before = this.shield;
    this.changeShield(amount);
    for (const flag of option.setFlags || []) this.flags.add(flag);
    if (option.removeOptionAfterUse) this.usedOptions.add(option.id);
    return { next: option.next, change: this.shield - before };
  }

  // Move to another scene, or "ending".
  goTo(sceneId) {
    this.sceneId = sceneId;
    this.visitedScenes.add(sceneId);
  }

  // Check endings in the order listed and return the first that matches:
  // every flag in "requires" is set, and none in "requiresMissing" is.
  ending() {
    return (
      this.episode.endings.find(
        (ending) =>
          ending.requires.every((flag) => this.flags.has(flag)) &&
          (ending.requiresMissing || []).every((flag) => !this.flags.has(flag))
      ) || null
    );
  }

  // A badge can need a flag, flags that must NOT be set (Episode 4's "No
  // Shortcuts"), a scene the player reached, and/or scenes the player never
  // visited (Episode 2's "Right Channel": no Scene 3A). That last one can be
  // one scene id or a list of them.
  badges() {
    return (this.episode.badges || []).filter(
      (badge) =>
        (!badge.requiresFlag || this.flags.has(badge.requiresFlag)) &&
        (badge.requiresMissing || []).every((flag) => !this.flags.has(flag)) &&
        (!badge.requiresScene || this.visitedScenes.has(badge.requiresScene)) &&
        [].concat(badge.requiresSceneNotVisited || []).every((id) => !this.visitedScenes.has(id))
    );
  }
}
