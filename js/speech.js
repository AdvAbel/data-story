// speech.js — reads the comic aloud with the browser's built-in voices.
//
// Off by default. If the browser has no speechSynthesis, supported is false,
// main.js hides the toggle, and every function here quietly does nothing.
// Every browser call is wrapped in try/catch, so a speech problem can never
// stop the game.

const synth = window.speechSynthesis;
export const supported = Boolean(synth && window.SpeechSynthesisUtterance);

let on = false;
let voiceSettings = {}; // each character's voice type, pitch and rate, from content/audio.json
let voiceLists = {}; // the ranked female and male voice names, also from content/audio.json
let assigned = {}; // which voice each character got
let lastLog = "";
let lastItems = null; // what's on screen now, so turning read-aloud on can read it
let runId = 0; // goes up with each new reading, so old readings' events are ignored
let keep = []; // some browsers drop utterances nobody holds on to
let startTimer = null; // the short wait between stopping old speech and starting new
let onSpeakingChange = () => {};

// Browsers don't say whether a voice is female or male, so voices are chosen
// by name from the ranked lists. Mac novelty voices are never used.
const NOVELTY = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox/i;

const language = (voice) => voice.lang.replace("_", "-");

// All the voices on this device that match a ranked list, best first: one per
// name, so "Isha" and "Isha (Enhanced)" count as the same person. A name's
// downloaded higher-quality version is used if it's there.
// On-device voices come before online ones, so text stays on the device where possible.
function findVoices(names, voices) {
  const quality = (voice) => (/Premium/i.test(voice.name) ? 2 : /Enhanced/i.test(voice.name) ? 1 : 0);
  const found = [];
  for (const localOnly of [true, false]) {
    for (const name of names) {
      const safeName = name.replace(/[()]/g, "\\$&"); // brackets in a name are just brackets
      const pattern = new RegExp(`(^|\\s)${safeName}(\\s|$)`, "i");
      const matches = voices.filter((voice) => voice.localService === localOnly && pattern.test(voice.name));
      const best = matches.sort((a, b) => quality(b) - quality(a))[0];
      if (best && !found.some((voice) => pattern.test(voice.name))) found.push(best);
    }
  }
  return found;
}

// The fallback when a list finds nothing: Indian English on this device,
// then any English on this device, then the same online.
function anyEnglishVoice(voices) {
  const score = (voice) => (voice.localService ? 0 : 2) + (/^en-IN$/i.test(language(voice)) ? 0 : 1) + (voice.default ? 0 : 0.5);
  return [...voices].sort((a, b) => score(a) - score(b))[0] || null;
}

function pickVoices() {
  try {
    const voices = synth.getVoices().filter((voice) => /^en\b/i.test(language(voice)) && !NOVELTY.test(voice.name));
    const female = findVoices(voiceLists.female, voices);
    const male = findVoices(voiceLists.male, voices);
    const fallback = anyEnglishVoice(voices);
    assigned = {};
    // Characters are chosen in the order they're listed in content/audio.json.
    for (const [who, settings] of Object.entries(voiceSettings)) {
      if (who.startsWith("_") || settings.kind === "left") continue;
      const list = settings.kind === "male" ? male : settings.kind === "any" ? [...female, ...male] : female;
      const avoid = (settings.avoid || []).map((other) => assigned[other]);
      assigned[who] = list.find((voice) => !avoid.includes(voice)) || list[0] || fallback;
    }
    // The mediator takes whichever voice nobody else has.
    const used = Object.values(assigned);
    const left = [...female, ...male].find((voice) => !used.includes(voice)) || assigned.narrator || fallback;
    for (const [who, settings] of Object.entries(voiceSettings)) {
      if (settings.kind === "left") assigned[who] = left;
    }
    logVoices();
  } catch (error) {
    assigned = {};
  }
}

// Shows which voice each character got in the console, so it's easy to check.
function logVoices() {
  const lines = Object.entries(assigned).map(([who, voice]) => (
    `${who}: ${voice ? `${voice.name} [${language(voice)}]${voice.localService ? "" : " (online)"}` : "browser default"}`
  ));
  const text = `Read-aloud voices:\n${lines.join("\n")}`;
  if (text !== lastLog) console.log(text);
  lastLog = text;
}

export function setupSpeech(voices, lists, speakingChanged) {
  voiceSettings = voices;
  voiceLists = lists;
  onSpeakingChange = speakingChanged;
  if (!supported) return;
  pickVoices();
  // Many browsers load their voice list a moment after the page.
  try {
    synth.addEventListener("voiceschanged", pickVoices);
  } catch (error) {
    // Older browsers: the first pickVoices() has to do.
  }
}

export function isOn() {
  return on;
}

export function setOn(value) {
  on = value && supported;
  if (on) speak(lastItems);
  else stop();
}

// Stop talking now. forget also clears the screen's text (used on menu screens).
export function stop(forget = false) {
  if (forget) lastItems = null;
  if (!supported) return;
  runId += 1;
  clearTimeout(startTimer);
  keep = [];
  try {
    if (synth.speaking || synth.pending) synth.cancel();
  } catch (error) {
    // Nothing to do.
  }
  onSpeakingChange(false);
}

// Long text is read a sentence at a time: some browsers cut off very long speech.
// Short text stays whole, because every extra piece slows the voice down.
function sentences(text) {
  if (text.length <= 200) return [text];
  return text.match(/[^.!?]+(?:[.!?]+["')\]]*\s*|$)/g) || [text];
}

// items: [{ text, who }], read in order. who is a character id, or empty for the narrator.
export function speak(items) {
  lastItems = items;
  stop();
  if (!on || !items) return;
  const run = runId;
  // Chrome on a Mac loses speech that starts straight after a cancel, so wait a moment.
  startTimer = setTimeout(() => {
    if (run === runId) queue(items, run);
  }, 150);
}

function queue(items, run) {
  const parts = [];
  for (const item of items) {
    if (!item.text) continue;
    for (const text of sentences(item.text)) parts.push({ text, who: item.who });
  }
  try {
    parts.forEach((part, index) => {
      const settings = voiceSettings[part.who] || voiceSettings.narrator || {};
      const utterance = new SpeechSynthesisUtterance(part.text);
      const voice = assigned[part.who] || assigned.narrator;
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      utterance.pitch = settings.pitch ?? 1;
      utterance.rate = settings.rate ?? 1;
      utterance.onstart = () => {
        if (run === runId) onSpeakingChange(true);
      };
      utterance.onend = utterance.onerror = () => {
        if (run === runId && index === parts.length - 1) onSpeakingChange(false);
      };
      keep.push(utterance);
      synth.speak(utterance);
    });
  } catch (error) {
    onSpeakingChange(false);
  }
}
