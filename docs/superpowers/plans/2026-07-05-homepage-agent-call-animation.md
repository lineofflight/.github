# Homepage Agent-Call Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static pixel-art SVG on the homepage with a vanilla-JS animation that renders "have your agent call my agent. thanks, bluefish." as a lofi terminal status-line-then-streamed-text sequence.

**Architecture:** A single inline `<script>` in `index.html` drives a two-phase state machine (ticking status line, then chunked text stream) using `setTimeout`. No build step, no dependencies, no new files beyond the plan/spec docs. Deletes the now-unused SVG generator and its assets.

**Tech Stack:** Plain HTML/CSS/JS (ES5-style, no transpilation), Jekyll (existing site generator), Node (only for one-off scratch verification of a pure function, not shipped).

## Global Constraints

- Final text is exactly: `have your agent call my agent. thanks, bluefish.` (must match verbatim — same string as the SVG's alt text it replaces).
- No client-side dependencies or build tooling — this site ships plain static files with no JS bundler.
- Font stack: `ui-monospace, Menlo, Consolas, monospace`.
- Container width matches the image it replaces: `max-width: 30rem`.
- Must degrade to static final text (no animation) for both no-JS (`<noscript>`) and `prefers-reduced-motion: reduce`.
- Must remain screen-reader accessible: a visually-hidden element always exposes the final text regardless of JS/motion state, and the animated elements are `aria-hidden="true"` to avoid double-announcing.
- Runs once per page load; no loop, no replay trigger.

---

### Task 1: Build and verify the agent-call animation in `index.html`

**Files:**
- Modify: `index.html`
- Scratch (not committed): `/tmp/chunk-words-test.js` — used only to verify the chunking logic before it's pasted into `index.html`, deleted at the end of this task.

**Interfaces:**
- Produces: `index.html` contains `#agent-call` (container, `aria-hidden="true"`), `#agent-call-status`, `#agent-call-response`, a `<noscript>` fallback, a visually-hidden `<span>` with the final text, and an inline `<script>` implementing the animation. Task 2 depends on this task having removed the last reference to `have-your-agent-call-my-agent.svg`.

- [ ] **Step 1: Write a failing verification for the word-chunking logic**

Create `/tmp/chunk-words-test.js`:

```js
function fakeRand(values) {
  var i = 0;
  return function () {
    var v = values[i % values.length];
    i += 1;
    return v;
  };
}

var FINAL = 'have your agent call my agent. thanks, bluefish.';

var chunks = chunkWords(FINAL, fakeRand([0, 0.5, 0.99]));
var expected = ['have', 'your agent', 'call my agent.', 'thanks,', 'bluefish.'];
if (JSON.stringify(chunks) !== JSON.stringify(expected)) {
  throw new Error('deterministic case failed: ' + JSON.stringify(chunks));
}

for (var trial = 0; trial < 1000; trial++) {
  var trialChunks = chunkWords(FINAL, Math.random);
  if (trialChunks.join(' ') !== FINAL) {
    throw new Error('property check failed on trial ' + trial + ': ' + trialChunks.join(' '));
  }
}

console.log('OK');
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node /tmp/chunk-words-test.js`
Expected: throws `ReferenceError: chunkWords is not defined` (non-zero exit code).

- [ ] **Step 3: Implement `chunkWords` and re-verify**

Prepend this to the top of `/tmp/chunk-words-test.js`:

```js
function chunkWords(text, rand) {
  var words = text.split(' ');
  var chunks = [];
  var i = 0;
  while (i < words.length) {
    var size = 1 + Math.floor(rand() * 3);
    chunks.push(words.slice(i, i + size).join(' '));
    i += size;
  }
  return chunks;
}
```

- [ ] **Step 4: Run it again and confirm it passes**

Run: `node /tmp/chunk-words-test.js`
Expected: prints `OK`, exit code 0.

- [ ] **Step 5: Replace the homepage markup with the full animation**

Replace the body of `index.html` (everything after the front matter) with:

```html
<style>
  @keyframes agent-call-blink {
    50% { opacity: 0; }
  }
</style>
<div id="agent-call" aria-hidden="true" style="font-family: ui-monospace, Menlo, Consolas, monospace; max-width: 30rem;">
  <div id="agent-call-status" style="font-size: 0.875rem; opacity: 0.6;"></div>
  <div id="agent-call-response" style="font-size: 1.25rem;"></div>
  <noscript>have your agent call my agent. thanks, bluefish.</noscript>
</div>
<span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap;">have your agent call my agent. thanks, bluefish.</span>
<script>
  (function () {
    var FINAL = 'have your agent call my agent. thanks, bluefish.';
    var statusEl = document.getElementById('agent-call-status');
    var responseEl = document.getElementById('agent-call-response');

    function showFinal() {
      statusEl.textContent = '';
      responseEl.textContent = FINAL;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      showFinal();
      return;
    }

    function chunkWords(text, rand) {
      var words = text.split(' ');
      var chunks = [];
      var i = 0;
      while (i < words.length) {
        var size = 1 + Math.floor(rand() * 3);
        chunks.push(words.slice(i, i + size).join(' '));
        i += size;
      }
      return chunks;
    }

    function streamResponse() {
      var chunks = chunkWords(FINAL, Math.random);
      var cursor = document.createElement('span');
      cursor.textContent = '▌';
      cursor.style.animation = 'agent-call-blink 1s step-start infinite';
      responseEl.appendChild(cursor);

      var index = 0;
      function next() {
        if (index >= chunks.length) {
          cursor.remove();
          return;
        }
        var text = (index === 0 ? '' : ' ') + chunks[index];
        responseEl.insertBefore(document.createTextNode(text), cursor);
        index += 1;
        setTimeout(next, 60 + Math.random() * 100);
      }
      next();
    }

    var STATUS_STATES = ['1s', '2s', '3s', 'thinking…'];
    var statusIndex = 0;
    function tickStatus() {
      statusEl.textContent = STATUS_STATES[statusIndex];
      statusIndex += 1;
      if (statusIndex < STATUS_STATES.length) {
        setTimeout(tickStatus, 1000);
      } else {
        setTimeout(function () {
          statusEl.textContent = '';
          streamResponse();
        }, 1200);
      }
    }

    tickStatus();
  })();
</script>
```

The front matter (the `---`-delimited block with `layout`, `title`, `description`) stays unchanged — only the body below it is replaced.

- [ ] **Step 6: Build the site and check the markup landed**

Run: `bundle exec jekyll build`
Expected: `Generating... done in 0.0X seconds.` with no errors.

Run: `grep -c 'have your agent call my agent' _site/index.html`
Expected: a number greater than 0 (confirms the text made it into the compiled output).

- [ ] **Step 7: Verify behavior in a browser**

Run: `bundle exec jekyll serve --port 4000 &` then open `http://localhost:4000/`. Confirm:
- Status line shows `1s`, then `2s`, then `3s`, then `thinking…` (roughly one per second), then clears.
- Response text streams in over the next stretch in uneven chunks and settles on exactly `have your agent call my agent. thanks, bluefish.`
- A blinking block cursor (`▌`) is visible while streaming and gone once the line is complete.
- Toggling OS/browser dark mode flips the text color correctly (it should inherit the page's existing text color, same as the rest of the site).
- In DevTools → Rendering, emulate `prefers-reduced-motion: reduce` and reload: the final text appears immediately with no status line or streaming.
- In DevTools, disable JavaScript and reload: the plain static text appears immediately (the `<noscript>` fallback), with no layout breakage.

Stop the server afterward (`kill %1` or `fg` + Ctrl-C).

- [ ] **Step 8: Clean up the scratch file**

Run: `rm /tmp/chunk-words-test.js`

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "Replace homepage pixel-art SVG with streaming terminal animation"
```

---

### Task 2: Remove the now-unused pixel-art SVG assets

**Files:**
- Delete: `have-your-agent-call-my-agent.svg`
- Delete: `script/generate-lofi.js`
- Delete: `script/have-your-agent-call-my-agent.jpg`

**Interfaces:**
- Consumes: Task 1 must be committed first — `index.html` no longer references `have-your-agent-call-my-agent.svg`.

- [ ] **Step 1: Confirm nothing else references the SVG**

Run: `grep -rln "have-your-agent-call-my-agent.svg" --include="*.html" --include="*.yml" --include="*.md" . | grep -v _site`
Expected: no output (empty result).

- [ ] **Step 2: Delete the unused files**

```bash
git rm have-your-agent-call-my-agent.svg script/generate-lofi.js script/have-your-agent-call-my-agent.jpg
```

- [ ] **Step 3: Rebuild to confirm nothing broke**

Run: `bundle exec jekyll build`
Expected: `Generating... done in 0.0X seconds.` with no errors about missing files.

- [ ] **Step 4: Commit**

```bash
git commit -m "Remove unused pixel-art SVG assets"
```
