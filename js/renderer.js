// renderer.js — builds the HTML for comic panels, characters, speech
// bubbles and the mock phone screens.
//
// Art rule: we always try the real image first (art/characters/meera_worried.webp,
// then .png for newly added art that hasn't been converted yet).
// If the file is missing, the browser fires an "error" event and we swap in
// a drawn placeholder. So dropping a correctly named PNG into the art folder
// is all it takes to replace a placeholder — no code changes.

// Small helper: make an element with an optional class and text.
// Text always goes in with textContent, so script text is shown exactly as written.
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

// Add the game's version number to a file path, e.g. "content/ui.json?v=20261029-1530".
// The number lives on the <html> tag in index.html and changes with every
// update (tools/set-version.py), so browsers fetch new files instead of
// reusing old copies.
export function withVersion(path) {
  const version = document.documentElement.dataset.version;
  return version ? `${path}?v=${version}` : path;
}

// Try each image path in turn; if all fail, show the placeholder instead.
function imageWithFallback(paths, altText, className, makePlaceholder) {
  const img = el("img", className);
  img.alt = altText;
  img.decoding = "async";
  let attempt = 0;
  img.addEventListener("error", () => {
    attempt += 1;
    if (attempt < paths.length) {
      img.src = withVersion(paths[attempt]);
    } else {
      img.replaceWith(makePlaceholder());
    }
  });
  img.src = withVersion(paths[0]);
  return img;
}

// ---------- Characters ----------

// Placeholder: a head-and-shoulders silhouette in the character's colour,
// with a small label such as "Meera · worried".
function characterPlaceholder(character, expression) {
  const box = el("div", "character placeholder-character");
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 100 120");
  svg.setAttribute("aria-hidden", "true");
  const head = document.createElementNS(svgNS, "circle");
  head.setAttribute("cx", "50");
  head.setAttribute("cy", "38");
  head.setAttribute("r", "24");
  const shoulders = document.createElementNS(svgNS, "path");
  shoulders.setAttribute("d", "M8 120 C8 82 26 68 50 68 C74 68 92 82 92 120 Z");
  for (const shape of [head, shoulders]) {
    shape.setAttribute("fill", character.colour);
    shape.setAttribute("stroke", "#111");
    shape.setAttribute("stroke-width", "3");
    svg.appendChild(shape);
  }
  box.appendChild(svg);
  box.appendChild(el("span", "placeholder-label", `${character.name} · ${expression}`));
  return box;
}

export function characterImage(characters, id, expression) {
  const character = characters[id];
  return imageWithFallback(
    [`art/characters/${id}_${expression}.webp`, `art/characters/${id}_${expression}.png`],
    `${character.name}, ${expression}`,
    "character",
    () => characterPlaceholder(character, expression)
  );
}

// ---------- Backgrounds ----------

// Placeholder: a flat colour block with the location name.
function backgroundPlaceholder(background) {
  const box = el("div", "background placeholder-background");
  box.style.background = background.colour;
  box.appendChild(el("span", "placeholder-label", background.label));
  return box;
}

export function backgroundImage(backgrounds, id) {
  const background = backgrounds[id];
  // The published art is .webp (much smaller). The art guide's .png and .jpg are
  // tried next, so a newly added image still shows before it's converted.
  return imageWithFallback(
    [`art/backgrounds/${id}.webp`, `art/backgrounds/${id}.png`, `art/backgrounds/${id}.jpg`],
    "",
    "background",
    () => backgroundPlaceholder(background)
  );
}

// ---------- Mock phone screens ----------
// Each "type" in an episode's appScreens gets its own small layout.
// All the words come from the JSON.

function phone(appName) {
  const frame = el("div", "phone");
  if (appName) frame.appendChild(el("div", "phone-bar", appName));
  const body = el("div", "phone-body");
  frame.appendChild(body);
  return { frame, body };
}

export function appScreen(screen) {
  // The teaser and split panel are cards, not phones.
  if (screen.type === "teaser") {
    return el("div", "teaser-card", screen.text);
  }
  if (screen.type === "split") {
    const split = el("div", "split-screen");
    const left = el("div", "split-half split-easy");
    left.appendChild(el("p", "split-big", screen.left));
    const right = el("div", "split-half split-hard");
    const steps = el("ol", "split-steps");
    for (const step of screen.rightSteps) steps.appendChild(el("li", "", step));
    right.appendChild(steps);
    right.appendChild(el("p", "split-end", screen.rightEnd));
    split.append(left, right);
    return split;
  }

  // Board screens get a simple scales icon (never a real government emblem).
  const isBoard = screen.type === "hearing" || screen.type === "order";
  const { frame, body } = phone(screen.app && isBoard ? `⚖️ ${screen.app}` : screen.app);
  frame.classList.add(`phone-${screen.type}`);

  switch (screen.type) {
    case "ad":
      body.appendChild(el("p", "ad-text", screen.text));
      break;

    case "permissions": {
      const list = el("ul", "permission-list");
      for (const permission of screen.permissions) {
        const item = el("li", permission.ticked ? "ticked" : "unticked");
        item.appendChild(el("span", "tick", permission.ticked ? "☑" : "☐"));
        item.appendChild(el("span", "", permission.name));
        list.appendChild(item);
      }
      body.appendChild(list);
      if (screen.banner) body.appendChild(el("p", "red-banner", screen.banner));
      body.appendChild(el("div", "phone-button", screen.button));
      if (screen.link) body.appendChild(el("p", "tiny-link", screen.link));
      break;
    }

    case "approved":
      body.appendChild(el("div", "confetti", "🎉"));
      body.appendChild(el("p", "approved-text", screen.text));
      break;

    case "notice":
      body.appendChild(el("p", "notice-text", screen.text));
      if (screen.languages) {
        const toggle = el("div", "language-toggle");
        screen.languages.forEach((language, index) => {
          toggle.appendChild(el("span", index === 0 ? "language active" : "language", language));
        });
        body.appendChild(toggle);
      }
      break;

    case "calendar": {
      if (screen.text) body.appendChild(el("p", "notice-text", screen.text));
      const entry = el("div", "calendar-entry", screen.calendar);
      if (screen.time) entry.prepend(el("span", "notification-time", screen.time)); // Episode 5: "two months ago"
      body.appendChild(entry);
      break;
    }

    // Episode 5, P4.2: a form with empty fields to fill in.
    case "fields":
      body.appendChild(el("p", "notice-text", screen.text));
      for (const field of screen.fields) {
        body.appendChild(el("span", "form-field-label", field));
        body.appendChild(el("div", "form-field"));
      }
      break;

    case "notification": {
      const note = el("div", "notification", screen.text);
      if (screen.time) note.prepend(el("span", "notification-time", screen.time)); // Episode 4: "1:12 a.m."
      body.appendChild(note);
      break;
    }

    // Episode 4, P3.1: a targeted offer, with a public spending leaderboard under it.
    case "offer": {
      body.appendChild(el("p", "ad-text", screen.text));
      const board = el("div", "leaderboard");
      board.appendChild(el("p", "leaderboard-title", screen.leaderboardTitle));
      board.appendChild(el("p", "leaderboard-entry", screen.leaderboardEntry));
      body.appendChild(board);
      break;
    }

    case "chat": {
      body.appendChild(el("p", "chat-sender", screen.sender));
      body.appendChild(el("div", "chat-bubble", screen.text));
      break;
    }

    case "icon": {
      const icon = el("div", "app-icon");
      icon.appendChild(el("span", "app-icon-tile", "₹"));
      icon.appendChild(el("span", "app-icon-name", screen.app));
      body.appendChild(icon);
      break;
    }

    case "footer":
      body.appendChild(el("p", "footer-text", screen.text));
      break;

    case "email":
      if (screen.from) body.appendChild(el("p", "email-from", screen.from));
      if (screen.subject) body.appendChild(el("p", "email-subject", screen.subject));
      body.appendChild(el("p", "email-body", screen.body));
      break;

    // Episode 2, P2C.1: a form question with the player's answer picked.
    case "form": {
      body.appendChild(el("p", "form-question", screen.question));
      const answers = el("div", "form-answers");
      for (const answer of screen.answers) {
        answers.appendChild(el("span", answer.chosen ? "form-answer chosen" : "form-answer", answer.text));
      }
      body.appendChild(answers);
      break;
    }

    // Episode 2, P4.1: headed lists (data held, uses, who it was shared with).
    case "summary":
      for (const group of screen.groups) {
        body.appendChild(el("p", "summary-title", group.title));
        const list = el("ul", "summary-list");
        for (const item of group.items) list.appendChild(el("li", "", item));
        body.appendChild(list);
      }
      break;

    // Episode 2, P5.1: a screen of big buttons.
    case "menu":
      for (const label of screen.buttons) body.appendChild(el("div", "phone-button", label));
      break;

    // Episode 3: a text message (one, with a link) or a back-and-forth thread.
    case "sms":
      body.appendChild(el("p", "chat-sender", screen.sender));
      if (screen.text) {
        const message = el("div", "sms-bubble", `${screen.text} `);
        if (screen.link) message.appendChild(el("span", "sms-link", screen.link));
        body.appendChild(message);
      }
      for (const message of screen.messages || []) {
        body.appendChild(el("div", message.mine ? "sms-bubble mine" : "sms-bubble", message.text));
      }
      break;

    // Episode 3, P2.1: a phone call in progress, with what the caller says.
    case "call":
      body.appendChild(el("p", "call-caller", `📞 ${screen.caller}`));
      body.appendChild(el("p", "call-text", `“${screen.text}”`));
      break;

    // Episode 3, P2.2: a news headline.
    case "news":
      body.appendChild(el("p", "news-text", screen.text));
      break;

    // Episode 3, P2A.1: Meera's social post, with a screenshot of the scam SMS.
    case "post": {
      const top = el("p", "post-author", screen.author);
      top.appendChild(el("span", "post-tag", ` @${screen.tag}`));
      body.appendChild(top);
      const shot = el("div", "post-embed");
      shot.appendChild(el("p", "chat-sender", screen.embed.sender));
      shot.appendChild(el("p", "", screen.embed.text));
      // Episode 6, P1B.1: her friends' names and numbers are showing. The
      // script gives none, so they're drawn as blurred blocks, not invented.
      if (screen.contactsShowing) shot.appendChild(el("p", "post-contacts", "👤 ▇▇▇▇ ▇▇▇▇▇  📞 ▇▇▇▇▇ ▇▇▇▇▇"));
      body.appendChild(shot);
      body.appendChild(el("p", "post-actions", "❤️ 🔁 💬"));
      break;
    }

    // Episode 3, P3.1: the breach notice, one short block per section.
    case "sections":
      if (screen.title) body.appendChild(el("p", "sections-title", screen.title));
      for (const section of screen.sections) {
        const block = el("div", "section-block");
        block.appendChild(el("strong", "", `${section.heading} `));
        block.appendChild(document.createTextNode(section.text));
        body.appendChild(block);
      }
      if (screen.button) body.appendChild(el("div", "phone-button", screen.button)); // Episode 6: "Submit"
      break;

    // Episode 6, P1.2: a laptop folder and the files in it.
    case "folder": {
      body.appendChild(el("p", "folder-title", `📁 ${screen.title}`));
      for (const item of screen.items) body.appendChild(el("p", "folder-item", `📄 ${item}`));
      break;
    }

    // Episode 6, P1C.1: a search box.
    case "search":
      body.appendChild(el("div", "search-box", `🔍 ${screen.text}`));
      break;

    // Episode 6 hearings: a video call. Each tile shows a name; only Meera
    // has a picture. The Board Member, mediator and lawyer never get one.
    case "hearing": {
      const grid = el("div", "hearing-tiles");
      for (const tile of screen.tiles) {
        const box = el("div", tile.portrait ? "hearing-tile has-portrait" : "hearing-tile");
        if (tile.portrait) {
          const img = el("img", "hearing-portrait");
          img.alt = "";
          img.src = withVersion(`art/characters/${tile.portrait}.webp`);
          img.addEventListener("error", () => img.remove()); // no picture: just the name
          box.appendChild(img);
        }
        box.appendChild(el("span", "hearing-name", tile.name));
        grid.appendChild(box);
      }
      body.appendChild(grid);
      break;
    }

    // Episode 6, P7.2 and P7C.1: the case record, as a numbered list. One
    // finding can be greyed out with a label ("Undertaking accepted").
    case "record": {
      body.appendChild(el("p", "record-title", screen.title));
      const list = el("ol", "record-list");
      screen.items.forEach((item, index) => {
        const greyed = screen.greyedItem === index + 1;
        const li = el("li", greyed ? "greyed" : "", item);
        if (greyed) li.appendChild(el("span", "greyed-label", screen.greyedLabel));
        list.appendChild(li);
      });
      body.appendChild(list);
      break;
    }

    // Episode 6, P7E.1 and P8.1: a Board order.
    case "order":
      body.appendChild(el("p", "order-text", screen.text));
      break;

    default:
      body.appendChild(el("p", "", screen.text || ""));
  }
  return frame;
}

// ---------- Panels and speech bubbles ----------

// Where each character stands, as a % across the panel. Used to point the
// bubble's tail at the speaker.
function castPositions(count, hasScreen) {
  if (count === 1) return hasScreen ? [18] : [50];
  if (count === 2) return hasScreen ? [18, 82] : [27, 73];
  return Array.from({ length: count }, (_, i) => ((i + 0.5) * 100) / count);
}

export function speechBubble(line, characters, tailX) {
  const bubble = el("div", "bubble");
  bubble.style.setProperty("--tail-x", `${tailX}%`);
  bubble.appendChild(el("span", "bubble-speaker", characters[line.speaker].name));
  bubble.appendChild(el("span", "bubble-text", line.text));
  return bubble;
}

// Build one comic panel. Returns the panel element and its bubbles, which
// start hidden; the reader shows them one per tap.
export function renderPanel(panel, data) {
  const { characters, backgrounds, appScreens } = data;
  const hasScreen = Boolean(panel.appScreen);

  const frame = el("section", "panel");
  frame.setAttribute("aria-label", `Panel ${panel.id}`);

  const art = el("div", hasScreen ? "panel-art has-screen" : "panel-art");
  // phone_backdrop is a drawn phone held in two hands: the app screen goes
  // inside its blank screen instead of floating at the top (see styles.css).
  if (panel.background === "phone_backdrop") art.classList.add("on-phone-backdrop");
  art.appendChild(backgroundImage(backgrounds, panel.background));

  const caption = panel.caption ? el("div", "caption-box", panel.caption) : null;

  if (hasScreen && panel.background !== "phone_backdrop") {
    // Caption and screen are stacked, so the screen always starts below the
    // caption, however long it is (Episode 6's P3.1 has a three-line caption).
    const screen = appScreens[panel.appScreen];
    const stack = el("div", "art-top");
    if (caption) stack.appendChild(caption);
    const screenHolder = el("div", `screen-holder holder-${screen.type}`); // e.g. holder-hearing is wider
    screenHolder.appendChild(appScreen(screen));
    stack.appendChild(screenHolder);
    art.appendChild(stack);
  } else if (hasScreen) {
    // On phone_backdrop the screen sits inside the drawn phone instead (see styles.css).
    if (caption) art.appendChild(caption);
    const screen = appScreens[panel.appScreen];
    const screenHolder = el("div", `screen-holder holder-${screen.type}`); // e.g. holder-hearing is wider
    screenHolder.appendChild(appScreen(screen));
    art.appendChild(screenHolder);
  } else if (caption) {
    art.appendChild(caption);
  }

  const positions = castPositions(panel.characters.length, hasScreen);
  const cast = el("div", `cast cast-${panel.characters.length}`);
  panel.characters.forEach((member, index) => {
    const slot = el("div", "cast-slot");
    slot.style.left = `${positions[index]}%`;
    slot.appendChild(characterImage(characters, member.id, member.expression));
    cast.appendChild(slot);
  });
  art.appendChild(cast);
  frame.appendChild(art);

  // Speech bubbles sit under the art, each with its tail pointing up at the speaker.
  const bubbleArea = el("div", "bubble-area");
  const bubbles = panel.lines.map((line) => {
    const index = panel.characters.findIndex((member) => member.id === line.speaker);
    const tailX = index >= 0 ? positions[index] : 50;
    const bubble = speechBubble(line, characters, tailX);
    bubble.hidden = true;
    bubbleArea.appendChild(bubble);
    return bubble;
  });
  if (bubbles.length) frame.appendChild(bubbleArea);

  return { element: frame, bubbles };
}
