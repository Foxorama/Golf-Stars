/**
 * Overlay focus + dialog semantics (GS-a11y-focus).
 *
 * The app has one render model: `app.innerHTML = …` rebuilds the entire screen, and overlays (the
 * settings sheet, the price notice, the exit confirm, the intro popovers) are rendered as SIBLINGS
 * of `<main>` inside that same string. That is fine for a mouse, and broken for everything else:
 *
 *   · nothing was ever a `role="dialog"`, so a screen reader announced no boundary and no name;
 *   · focus never entered an opened sheet — `document.activeElement` stayed on `<body>`;
 *   · every button BEHIND the backdrop stayed tab-reachable, so Tab walked a keyboard user out of
 *     the sheet and into a page they could not see;
 *   · and closing the sheet dropped focus on the floor instead of returning it to the cog.
 *
 * Rather than patch each overlay builder (there are six, in four modules, and a seventh will be
 * written next week without any of this), this is ONE pass that runs after every render and makes
 * whatever overlay is mounted behave. A new overlay gets the behaviour by existing.
 *
 * Backgrounding uses `inert`, not a hand-rolled Tab trap: it removes the subtree from the tab order
 * AND from the accessibility tree AND from hit-testing, in one attribute, with no keydown handler to
 * get out of sync. Where `inert` is unsupported we fall back to `aria-hidden` + a tabindex sweep, so
 * the announcement fix still lands even if the tab-order fix cannot.
 *
 * Focus is moved only on the OPEN transition, never on a re-render — the settings sheet re-renders
 * surgically on every toggle (GS-settings-flicker), and re-focusing there would yank the player back
 * to the top of the sheet each time they flipped a switch.
 */

/** Every overlay root, most-recently-stacked last — the order they are concatenated in `render()`. */
const OVERLAY_SELECTOR = '.gs-sheet-backdrop, [data-gs-overlay]';

/**
 * A SELECTOR for whatever had focus most recently, not the element itself. `render()` replaces
 * `app.innerHTML` wholesale, so by the time the focus pass runs the focused node is detached and
 * `document.activeElement` has fallen back to `<body>` — an element reference would restore focus
 * to a node that is no longer in the document. A selector re-finds the rebuilt equivalent.
 */
let lastFocusSel: string | null = null;
/** The selector to restore to when the current overlay closes. */
let restoreSel: string | null = null;
/** Identity of the overlay we last focused, so a re-render doesn't re-focus the same sheet. */
let openKey: string | null = null;

/** A selector that will find this element again after the screen is rebuilt, if we can make one. */
function selectorFor(el: Element | null): string | null {
  if (!el || el === document.body || !(el instanceof HTMLElement)) return null;
  // The app identifies controls by `data-*` hooks, which survive a rebuild; ids and classes are
  // second best. Anything else is not worth guessing at.
  for (const a of el.attributes) {
    // Skip OUR OWN bookkeeping attributes — they are set on many elements at once, so they would
    // "restore" focus to whichever one happens to be first in the document.
    if (a.name === 'data-gs-tabsave' || a.name === 'data-gs-keys') continue;
    if (a.name.startsWith('data-')) {
      return a.value ? `[${a.name}="${CSS.escape(a.value)}"]` : `[${a.name}]`;
    }
  }
  if (el.id) return `#${CSS.escape(el.id)}`;
  const cls = el.classList[0];
  return cls ? `.${CSS.escape(cls)}` : null;
}

/**
 * Remember what has focus RIGHT NOW. Called from `render()` immediately before the DOM is replaced,
 * which is the last moment the information exists.
 */
export function captureFocusOrigin(): void {
  try {
    const sel = selectorFor(document.activeElement);
    if (sel) lastFocusSel = sel;
  } catch {
    /* ignore */
  }
}

/** A stable-enough identity for "is this the same overlay as last render?". */
function keyOf(el: Element): string {
  const inner = el.firstElementChild;
  return `${el.className}|${inner?.className ?? ''}`;
}

/** The visible, focusable descendants of a container, in tab order. */
function focusablesIn(root: ParentNode): HTMLElement[] {
  const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return [...root.querySelectorAll<HTMLElement>(sel)].filter(
    (e) => !e.hasAttribute('disabled') && e.getAttribute('aria-hidden') !== 'true' && e.offsetParent !== null,
  );
}

/** Best available accessible name for a sheet: its own heading text, else a generic. */
function nameFor(sheet: Element): string {
  const head = sheet.querySelector('.gs-sheet-head, h1, h2, h3, b');
  if (!head) return 'Dialog';
  // Read the heading WITHOUT its controls — a sheet head carries its own ✕ close button, and
  // `textContent` would fold that glyph into the name ("Settings ✕").
  const clone = head.cloneNode(true) as Element;
  for (const b of clone.querySelectorAll('button, [role="button"], [aria-hidden="true"]')) b.remove();
  const txt = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  // Strip leading/trailing decorative glyphs so the name reads as words, not "gear Settings".
  const cleaned = txt.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '').slice(0, 60);
  return cleaned || 'Dialog';
}

/**
 * Make the mounted overlay (if any) a real modal dialog, background the rest of the app, and move
 * focus in. Called at the end of every `render()`.
 *
 * `app` is the root the screen was rendered into. Everything inside it that is NOT the topmost
 * overlay gets backgrounded — which is exactly `<main>`, the floating settings cog, and any
 * lower-stacked overlay.
 */
export function applyOverlayFocus(app: HTMLElement): void {
  try {
    // Only a DIRECT child of the app root can be backgrounded against, because backgrounding works
    // by inerting every OTHER direct child. An overlay nested inside a screen body would live under
    // `<main>` — inerting `<main>` would then inert the overlay itself and freeze the whole app. All
    // of today's sheets are top-level siblings of `<main>`; this makes tomorrow's safe by ignoring
    // it rather than by locking the player out.
    const overlays = [...app.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)].filter(
      (el) => el.parentElement === app,
    );
    const top = overlays[overlays.length - 1] ?? null;

    // ── background everything that isn't the top overlay ────────────────────────────────────
    const supportsInert = 'inert' in HTMLElement.prototype;
    for (const child of [...app.children] as HTMLElement[]) {
      const isTop = child === top;
      if (top && !isTop) {
        if (supportsInert) child.inert = true;
        else {
          child.setAttribute('aria-hidden', 'true');
          for (const f of focusablesIn(child)) {
            if (!f.hasAttribute('data-gs-tabsave')) f.setAttribute('data-gs-tabsave', f.getAttribute('tabindex') ?? '');
            f.setAttribute('tabindex', '-1');
          }
        }
      } else {
        if (supportsInert) child.inert = false;
        child.removeAttribute('aria-hidden');
        for (const f of child.querySelectorAll<HTMLElement>('[data-gs-tabsave]')) {
          const prev = f.getAttribute('data-gs-tabsave')!;
          if (prev) f.setAttribute('tabindex', prev);
          else f.removeAttribute('tabindex');
          f.removeAttribute('data-gs-tabsave');
        }
      }
    }

    if (!top) {
      // ── closed: hand focus back to whatever raised the overlay ────────────────────────────
      if (openKey !== null) {
        openKey = null;
        const sel = restoreSel;
        restoreSel = null;
        if (sel) app.querySelector<HTMLElement>(sel)?.focus();
      }
      return;
    }

    // ── dialog semantics on the sheet itself (not the backdrop, which is the dismiss target) ──
    const sheet = top.querySelector<HTMLElement>('.gs-sheet') ?? top;
    if (!sheet.hasAttribute('role')) sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    if (!sheet.hasAttribute('aria-label') && !sheet.hasAttribute('aria-labelledby')) {
      sheet.setAttribute('aria-label', nameFor(sheet));
    }

    // ── move focus in, once per open ──────────────────────────────────────────────────────────
    const key = keyOf(top);
    const active = document.activeElement as HTMLElement | null;
    const focusIsLoose = !active || active === document.body || !app.contains(active);
    if (key !== openKey) {
      // A genuinely new overlay: remember where we came from, then focus it. The origin is the
      // selector captured just BEFORE this render tore the old screen down.
      if (openKey === null) restoreSel = lastFocusSel;
      openKey = key;
      focusInto(sheet);
    } else if (focusIsLoose) {
      // Same overlay, but a full re-render blew away the focused node. Put focus back rather than
      // leaving the keyboard user stranded on <body> behind an inert page.
      focusInto(sheet);
    }
  } catch {
    /* focus is an enhancement — never let it break a render */
  }
}

/** The stroke decision `focusPlayStroke` last placed focus for — so a re-render within the SAME
 *  decision (a club change, an aim-mode tap, the map toggle) doesn't keep hauling focus back. */
let lastStrokeKey: string | null = null;

/**
 * Put the keyboard ON the stroke (GS-a11y-stroke-focus).
 *
 * `render()` replaces `#app.innerHTML` wholesale, so after every single shot the focused node is
 * destroyed and `document.activeElement` falls back to `<body>` — the keyboard player starts from
 * the top of the page again. In a game that is *entirely* golf strokes, that meant Tab · Tab · Tab
 * to Swing on every shot and five or six to reach ⛳ Putt on every putt, for the whole round.
 *
 * So the play screen's primary action is focused as its decision mounts. It is the same shape as the
 * overlay pass above — move focus in ONCE per open, and put it back if a re-render knocks it loose —
 * with the same two refusals: never while an overlay owns the screen, and never onto a disabled
 * control (the watch states, where there is no decision to make).
 *
 * `key` identifies the DECISION, not the render: hole + stroke count + mode. `null` means "no stroke
 * decision is on screen" (watching, or another screen entirely) and re-arms the next one.
 *
 * The commit button is found through `.gs-hud-commit`, which is `playFrameHTML`'s own name for the
 * bottom-anchored commit row — the frame already guarantees exactly one, in every state, so this
 * asks the frame rather than keeping a second list of which button is primary in which state.
 */
export function focusPlayStroke(app: HTMLElement, key: string | null): void {
  try {
    if (key === null) {
      lastStrokeKey = null;
      return;
    }
    // Any COVERING layer owns focus: a raised sheet (where `applyOverlayFocus` has just placed it,
    // behind an inert page), and equally the shot-result card / scramble choice, which are not
    // dialogs by that pass's definition — they live inside `<main>` — but are absolutely something
    // the player has to answer first. The DOM is asked, never a flag: `awaitingShotPopup` stays true
    // through a putt render that draws no popup at all.
    if (app.querySelector(OVERLAY_SELECTOR)) return;

    const isNew = key !== lastStrokeKey;
    lastStrokeKey = key;
    const active = document.activeElement as HTMLElement | null;
    const loose = !active || active === document.body || !app.contains(active);
    if (!isNew && !loose) return; // the player has put focus somewhere deliberately — leave it

    // Same decision, focus knocked loose by a re-render: put it back where the player had it. The
    // selector was captured immediately BEFORE the innerHTML swap, so it names the control they were
    // on — without this, tapping the aim mode would bounce them to the commit every time.
    if (!isNew && lastFocusSel) {
      const back = app.querySelector<HTMLElement>(lastFocusSel);
      if (back && back.closest('.gs-shot') && !back.hasAttribute('disabled') && back.offsetParent !== null) {
        back.focus({ preventScroll: true });
        return;
      }
    }
    // `preventScroll` because the play screen is a full-bleed fixed frame: scrolling it to "reveal"
    // a button that is already on screen is pure jitter (GS-embed-scroll makes the page scrollable
    // in an iframe, so this is not hypothetical).
    app.querySelector<HTMLElement>('.gs-hud-commit button:not([disabled])')?.focus({ preventScroll: true });
  } catch {
    /* focus is an enhancement — never let it break a render */
  }
}

/** Focus the sheet's first control, falling back to the sheet itself. */
function focusInto(sheet: HTMLElement): void {
  const first = focusablesIn(sheet)[0];
  if (first) {
    first.focus();
    return;
  }
  if (!sheet.hasAttribute('tabindex')) sheet.setAttribute('tabindex', '-1');
  sheet.focus();
}

/**
 * Run a DOM update that replaces `root`'s contents, and put focus back on the equivalent control
 * afterwards. For the SURGICAL re-renders (the settings sheet re-renders its own inner HTML on every
 * toggle, GS-settings-flicker) — without this the focused control is destroyed mid-interaction and
 * the keyboard player is bounced to the top of the sheet on every switch they flip.
 */
export function preservingFocus(root: ParentNode, update: () => void): void {
  let sel: string | null = null;
  try {
    const active = document.activeElement;
    if (active && root.contains(active)) sel = selectorFor(active);
  } catch {
    /* ignore */
  }
  update();
  if (!sel) return;
  try {
    root.querySelector<HTMLElement>(sel)?.focus();
  } catch {
    /* a control that no longer exists after the update — leave focus alone */
  }
}

/**
 * Give every non-native `role="button"` the keyboard contract a real `<button>` has for free
 * (GS-a11y-focus): a tab stop, and Enter/Space to activate.
 *
 * The app has three flavours of these — `<div>`/`<span>` cards carrying `data-action`, and SVG `<g>`
 * nodes on the journey map and the Star Tour chart carrying their own hooks (`data-route-inspect`,
 * `data-startour-course`, …). Several already declared `role="button" tabindex="0"` and then bound
 * only a `click`, so they advertised themselves to a screen reader as buttons and did nothing when
 * activated — arguably worse than not claiming the role at all.
 *
 * Activation synthesises a `click`, so whatever handler the element already has is the one that
 * runs; there is no second code path to keep in step. Marked with a data flag so a re-render (which
 * rebuilds the nodes) can't stack duplicate listeners on a survivor.
 */
export function wireRoleButtonKeys(root: ParentNode): void {
  const els = root.querySelectorAll<HTMLElement>('[role="button"]');
  for (const el of els) {
    const tag = el.tagName.toUpperCase();
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') continue;
    if (el.dataset.gsKeys === '1') continue;
    el.dataset.gsKeys = '1';
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k !== 'Enter' && k !== ' ' && k !== 'Spacebar') return;
      e.preventDefault(); // Space would otherwise scroll the page
      e.stopPropagation(); // …and must not also activate an enclosing card
      el.click();
    });
  }
}

/** Test seam: forget the open overlay so a fresh mount focuses again. */
export function resetOverlayFocus(): void {
  restoreSel = null;
  lastFocusSel = null;
  openKey = null;
  lastStrokeKey = null;
}
