// music.js — background music: a calm loop, a tense loop and a short ending sting.
//
// Nothing plays until the player's first click (begin). One small timer moves
// each track's volume towards where it should be, which gives us fades between
// the loops and the dip while read-aloud is speaking.
// A music problem can never stop the game: failed plays are simply ignored.

import { withVersion } from "./renderer.js";

let settings = null; // the "music" part of content/audio.json
const players = {}; // one <audio> element per track, made on the first click
let started = false;
let on = true;
let volume = 0.5;
let mood = "calm"; // which loop should be playing
let stinging = false; // the ending sting is playing, so the loops stay quiet
let ducked = false; // read-aloud is speaking
let fadeTimer = null;
let unduckTimer = null;

export function setupMusic(musicSettings, isOn, savedVolume) {
  settings = musicSettings;
  on = isOn;
  volume = savedVolume;
}

// How loud a track should be right now (0 to 1).
function targetVolume(name) {
  if (!started || !on) return 0;
  const active = name === "sting" ? stinging : name === mood && !stinging;
  if (!active) return 0;
  const level = settings.tracks[name].level ?? 1;
  return volume * level * (ducked ? settings.duckedTo : 1);
}

// Move every track a small step towards its target; stop the timer when all are there.
function fadeStep() {
  let moving = false;
  for (const [name, player] of Object.entries(players)) {
    const target = targetVolume(name);
    const difference = target - player.volume;
    if (Math.abs(difference) > 0.01) {
      player.volume = Math.min(1, Math.max(0, player.volume + Math.sign(difference) * 0.04));
      moving = true;
    } else {
      player.volume = target;
    }
    if (target > 0 && player.paused) tryPlay(player);
    if (target === 0 && player.volume === 0 && !player.paused) player.pause();
  }
  if (!moving) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

function update() {
  if (!started) return;
  if (!fadeTimer) fadeTimer = setInterval(fadeStep, 40);
}

function tryPlay(player) {
  try {
    const playing = player.play();
    if (playing) playing.catch(() => {}); // blocked or unsupported: stay silent
  } catch (error) {
    // Stay silent.
  }
}

// Called on the player's first click. Nothing is downloaded while music is off.
export function begin() {
  if (started || !settings) return;
  started = true;
  if (on) makePlayers();
  update();
}

// The tracks are made and started inside a click, because browsers only
// allow sound that a click began.
function makePlayers() {
  if (Object.keys(players).length) return;
  try {
    for (const [name, track] of Object.entries(settings.tracks)) {
      const player = new Audio(withVersion(track.file));
      player.loop = name !== "sting";
      player.volume = 0;
      players[name] = player;
      if (name === "sting") {
        player.addEventListener("ended", () => {
          stinging = false;
          update();
        });
      }
      // A silent start then pause: after this, the game may start this track later without a click.
      const playing = player.play();
      if (playing) playing.then(() => { if (targetVolume(name) === 0) player.pause(); }).catch(() => {});
    }
  } catch (error) {
    // Stay silent.
  }
}

export function setOn(value) {
  on = value;
  if (!on) stinging = false;
  // Turned on with this click, which is what allows the tracks to start.
  if (on && started) makePlayers();
  update();
}

export function setVolume(value) {
  volume = value;
  update();
}

export function setMood(name) {
  if (name === mood) return;
  mood = name;
  update();
}

// Lower the music while read-aloud is speaking.
// Coming back up waits a moment, so it doesn't swell in the gap between two lines.
export function duck(isSpeaking) {
  clearTimeout(unduckTimer);
  if (isSpeaking) {
    ducked = true;
    update();
  } else {
    unduckTimer = setTimeout(() => {
      ducked = false;
      update();
    }, 600);
  }
}

// Play the short sting once. The loop fades back in when it ends.
export function playSting() {
  if (!started || !on || !players.sting) return;
  stinging = true;
  players.sting.currentTime = 0;
  players.sting.volume = targetVolume("sting"); // full volume at once, not a fade
  tryPlay(players.sting);
  update();
}
