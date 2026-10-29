// storage.js — a safe wrapper around localStorage.
//
// Some browsers (private windows, strict privacy settings) block localStorage
// and throw an error when you touch it. Every call here is wrapped in
// try/catch, and if storage is blocked we keep the data in memory instead,
// so the game still works — it just forgets progress when the page closes.

const KEY = "dataStory.progress.v1";

// Used when localStorage is blocked.
let memoryCopy = null;

// The shape of a fresh save.
function emptyProgress() {
  return {
    disclaimerSeen: false,
    episodes: {} // e.g. { ep1: { completed: true, badges: [...], flags: [...], citation: {...} } }
  };
}

// True if the browser lets us save to localStorage.
export function storageAvailable() {
  try {
    const testKey = KEY + ".test";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
}

export function loadProgress() {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) return { ...emptyProgress(), ...JSON.parse(saved) };
  } catch (error) {
    // Storage blocked or the saved text was damaged: fall through.
  }
  return memoryCopy ? structuredClone(memoryCopy) : emptyProgress();
}

export function saveProgress(progress) {
  memoryCopy = structuredClone(progress);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch (error) {
    // Storage blocked: the memory copy above still works for this visit.
  }
}

export function resetProgress() {
  memoryCopy = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch (error) {
    // Nothing to do.
  }
}
