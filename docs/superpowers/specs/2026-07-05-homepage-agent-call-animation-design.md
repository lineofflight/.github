# Homepage agent-call streaming animation

## Summary

Replace the static pixel-art SVG on the homepage (`have-your-agent-call-my-agent.svg`, showing the text "have your agent call my agent. thanks, bluefish.") with a small vanilla-JS animation that renders the same line as a lofi terminal/status-line sequence, mimicking an LLM response streaming over the wire.

## Motivation

The homepage currently carries the joke as a static pixel-rendered image with alt text. The goal is to turn the joke into an actual demonstration: an animated sequence that looks like one agent calling another and receiving a streamed response, in keeping with the site's minimal, monospace, lofi aesthetic.

## Scope

- Replace the `<img>` on `index.html` with the animated markup + inline script described below.
- Delete `have-your-agent-call-my-agent.svg`, `script/generate-lofi.js`, and its source JPEG (`script/have-your-agent-call-my-agent.jpg`), since nothing else references them once the image is removed.
- No changes to any other page, layout, or the site's build process.

## Markup (`index.html`)

```html
<div id="agent-call" style="font-family: ui-monospace, Menlo, Consolas, monospace; max-width: 30rem;">
  <div id="agent-call-status" style="font-size: 0.875rem; opacity: 0.6;"></div>
  <div id="agent-call-response" style="font-size: 1.25rem;"></div>
  <noscript>have your agent call my agent. thanks, bluefish.</noscript>
</div>
<script>
  /* animation logic, see below */
</script>
```

Colors use `currentColor`/`opacity` so the block inherits the site's existing light/dark text color automatically, rather than needing its own `prefers-color-scheme` rule (unlike the SVG it replaces).

## Animation behavior

Implemented as an inline vanilla-JS state machine, no dependencies, no build step (matches this static Jekyll site's existing pattern of no client-side JS pipeline).

**Phase 1 — status line** (`#agent-call-status`):

- `1s` → `2s` → `3s` → `thinking…`, one state change per second.
- Holds on `thinking…` for ~1.2s, then clears the status line.

**Phase 2 — streamed response** (`#agent-call-response`):

- Full text: `have your agent call my agent. thanks, bluefish.`
- Split into words, grouped into random chunks of 1–3 words.
- Chunks are appended one at a time with a randomized ~60–160ms delay between them, producing an irregular, non-mechanical reveal (unlike a fixed-interval typewriter effect).
- A blinking block cursor (`▌`) trails the write head during streaming and is removed once the full line has landed.

**Playback:** runs once per page load; the final line remains in place afterward (no loop, no replay trigger).

## Accessibility and fallback

- **No JS:** the `<noscript>` element renders the plain final line as static text. Browsers with scripting enabled never render `<noscript>` contents, so this doesn't conflict with the animated version.
- **`prefers-reduced-motion: reduce`:** detected via `matchMedia` at the top of the script; when set, both phases are skipped and the response line is set directly to the final text — converging on the same output as the no-JS path.

## Out of scope

- No changes to the `og:image` meta tag or other assets referencing the old imagery (only `index.html`'s inline `<img>` references the SVG being removed).
- No looping, replay-on-click, or interactive triggers.
- No new build tooling; everything ships as inline HTML/CSS/JS in `index.html`.
