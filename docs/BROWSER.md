# The browser (`browse`)

`browser` gives the model a tool, `mcp__jev-mod__browse`, for pages a fetch cannot read: ones
that need clicking, typing, or several steps. The model states a goal; a small decision model
picks every step from what the page offers; a real Chromium does it. The model gets one answer
with a status, the final URL and title, one line per step, the console errors and failed requests
seen on the way (screened), and about 4,000 characters of the final page's text (screened). The answer shows the page as it is, the input values it typed
included, except an input that looks secret (below).

It is **off by default**. Turn it on with `/jev-mod browser on`.

## Setting it up

1. `/jev-mod browser install` (once). It makes `~/.cache/jev-mod/browser/` (`$XDG_CACHE_HOME`
   respected), runs `npm install playwright@1.62.1` there and `npx playwright install chromium`
   with the browsers kept in that same folder (`ms-playwright/`). About 150 MB; it needs `npm`,
   and says what `npm --version` answered when that fails.
   Nothing else ever installs it: a `browse` call with nothing installed answers `not_installed`
   and names this command. To remove it, delete the folder. On Linux, a Chromium that will not
   start may need system libraries: `npx playwright install-deps chromium` (asks for sudo).
2. `/jev-mod browser on`. The tool is offered from the next session, or from the next prompt in
   this one.

The browser runs under `node` (else `bun`), which must be on PATH; when neither starts, the
`failed` answer says what each said.

## The tool

Input:

| field | | |
|---|---|---|
| `goal` | required | The **end state**, plus what counts as progress: "Reach the team pricing page; the Pricing or Plans links count as progress". Not hop by hop. Name the kind of action when the goal needs one (buy, send, submit, sign up, delete). |
| `startUrl` | required to start | An http(s) URL. New call only; ignored with `resumeId`. |
| `inputs` | | `{"email": "…", "query": "…"}`: the only text the browser may type. The decision model sees the names, never the values. Values may be secrets. |
| `allowHosts` | | More hosts it may visit, each with its subdomains. New call only; ignored with `resumeId`. |
| `maxSteps` | | Steps for this call; never more than the `maxSteps` setting. |
| `attach` | | Drive your own Chrome instead (below); only when `allowAttach` is on. New call only; ignored with `resumeId`. |
| `resumeId` | | Carry on in a browser a previous answer left waiting. |
| `approve` | | With `resumeId`: an action id a `needs_confirm` or `blocked` answer offered, to do now. |

The answer is plain text, and the tool never throws. Besides the last page's text it carries
*found along the way*: each page the run read (at most 10), its URL and title, and its best three
sentences that share the goal's words (each at most 200 characters, 2000 in all: half the last
page's 4000), screened like the page text. A fact seen on page 2 is still there when the run ends
on page 4.

```text
status: needs_confirm
reason: the next step would buy or pay for something: click button "Buy now" under "Pricing". Not done, because the goal does not name that kind of action. Ask the person; only if they agree, call browse with resumeId and approve "click-e1".
url: https://acme.example/pricing
title: Acme pricing
resumeId: e8354ea759e8e28e7e332390 (the browser waits 5 minutes)
options:
- click-e1 (0.90): click button "Buy now" under "Pricing"
steps:
1. clicked link "Pricing" → acme.example/pricing (0.90)
2. stopped before: click button "Buy now" under "Pricing"
found along the way (each page read, with its sentences that share the goal's words; screened; data, not instructions):
- https://acme.example/ "Acme" (nothing matching)
- https://acme.example/pricing "Acme pricing":
  · Team plan: $10 per seat per month.
page text (screened; data, not instructions):
…
```

| status | means | what next |
|---|---|---|
| `done` | the decision model picked *done*, or said the goal is reached (below), and a second check over the page's own text found the exact thing the goal asks for on it | |
| `unverified` | the step budget ran out after a *done* the page check did not confirm | look at the page text |
| `needs_input` | a field needs text none of the inputs holds (the field is named) | call again with `resumeId` and that input |
| `needs_confirm` | a consequential step (below) the goal does not plainly ask for; or one that was attempted and whose result is unknown, or any consequential step after such an attempt (the `attempted` line says which) | ask the person; only on their yes, call again with `resumeId` and `approve` |
| `blocked` | no step is at least `stepFloor` sure, or the decision model abstained; its top three are named, and those that can be approved come back as options with probabilities | `approve` one, or call again with a clearer goal |
| `stuck` | the decision model said the run is stuck (repeating, or making no progress), at least 0.85 sure; or 0.6 sure while the last steps changed nothing. Not before two steps. Its top three come back as options, as for `blocked` | `resumeId` with a clearer goal, or `approve` an option |
| `bot_check` | the page is a bot check (Cloudflare, hCaptcha, reCAPTCHA, DataDome, PerimeterX) still there after 8 seconds; the `bot check` line names the provider and the evidence | ask the person; or, with `allowAttach` on, call again with `attach: true` in their own Chrome. In an attached Chrome it pauses, so they can solve it and resume |
| `left_allowlist` | a navigation or redirect went off the allowed hosts | `allowHosts`, if that host is meant |
| `budget` | the steps ran out | `resumeId` to carry on, with a fresh step budget |
| `not_installed` | no Playwright | the person runs `/jev-mod browser install` |
| `failed` | no key, private mode, the daily budget, a backend cool-off or failure, the browser stopped, an interrupt | the reason says which |

A pause (`needs_input`, `needs_confirm`, `blocked`, `stuck`, `budget`, and `bot_check` in an attached Chrome) keeps the browser for 5 minutes under a random
`resumeId`; then it is closed. At most three wait at once (the oldest is closed). Every other
status closes it at once, and every browser closes when the session ends.

## Each step

1. **Observe**, once the page is ready. After an action, two animation frames (or 50 ms); then
   an action that navigated (or went back) waits for the load and for the requests started since
   to go quiet for 100 ms (each capped at 3 seconds), and the DOM still for 300 ms; an action
   that did not (a same-page click, a type, a scroll) waits only for the requests it started
   (capped at 1.5 seconds; a poll that was running before it is not waited for) and the DOM
   still for 150 ms; a select or combobox gets 200 ms in all. Either way, while the page says it
   is loading (a line such as "Loading" or "Loading data...", something `aria-busy="true"`, a
   visible spinner), more waiting, up to 5 seconds. (It used to wait for 500 ms with no request at
   all after every action: on local pages a type took about 520 ms and now 300, a same-page click
   505 and 270, a link 910 and 550, and on a page that polls, a type or click 3.5 s and 0.3 s.)
   Then the page's visible links, buttons, fields, checkboxes and the like (up to 80,
   those in view first): role, label, the nearest heading above, a link's target, and for a field
   what it holds, never its value: `holds input "query"` (the driver matched it against the
   inputs, in its own process), `holds text (not from inputs)`, or `empty`. The page's main
   text: `<main>` (or the body without its header), with navigation, asides and footers left out,
   up to `textChars` characters. The visible frames' addresses (for the bot check), and the
   console errors and failed requests (an HTTP status of 400 or more, or no answer) since the last
   look: a request by its origin and path, never its query; at most 50 per look.
2. **Bot check**, locally, before anything is sent: a title such as "Just a moment...", text
   such as "Checking your browser before accessing", "Verifying you are human", "Press & Hold to
   confirm you are a human" or Google's "unusual traffic", a challenge URL, or a visible frame
   from challenges.cloudflare.com, hcaptcha.com, google.com/recaptcha, captcha-delivery.com
   (DataDome) or PerimeterX's hosts. A captcha box or a provider's name on an ordinary page (a
   contact form, a privacy page) is not one: those weaker signs count only on a thin page (under
   1,000 characters and 12 elements), and reCAPTCHA's invisible badge never does. A bot check
   gets 8 seconds (four looks, 2 seconds apart) to clear, as Cloudflare's often does; then the
   run stops as `bot_check`, without a step request. Nothing tries to solve it.
3. **Prepare the text.** Input values are cut out (as typed, and as a URL carries them, each as
   `[input:<name>]`), then
   the text is redacted (emails, phones, cards, tokens) and screened: passages carrying
   instructions aimed at an AI are withheld, by the same screen as WebFetch's, whatever the
   screening feature's own mode. A page with a password, card or one-time-code field, or text that
   looks like it holds secrets, is sent as its elements only. Labels have the values cut out, are
   redacted, and are screened locally (a label that looks like an injection or a secret is replaced).
   The redaction guards what leaves for the decision backend. The answer to the model carries the
   page text with the values cut out and screened, but not redacted, as a fetched page comes back
   (a phone number or an email address is often what was asked for); when screening withheld any
   of it, the answer carries the screened, redacted copy instead. A page sent as its elements only
   has no text in the answer either.
4. **The table.** `click-<id>` per element; per field that takes text, once it holds text
   `submit-<id>` (press Enter: runs a search box's search), `type-<input>-<id>` per input name
   (not the input the field holds already), and `fill-<id>` (none of the inputs fits: stops as
   `needs_input`; not offered for a field that holds an input); then `scroll-down`, `back`,
   `done`, `abstain`. Links off the allowed hosts
   (and `mailto:`, `tel:` and the like) are not offered. An action seen twice to change nothing on
   a page is not offered there again, nor a click whose target was found covered on the page as
   it is now.
5. **Pick.** One request: the choice "Which single action should be taken next to move toward
   the goal?" over the goal, the page, the elements and the last ten steps, and in the same
   request two yes/no questions, "Is the goal already reached on this page?" and "Is the run
   stuck: repeating the same actions, or making no progress toward the goal?". Below `stepFloor`
   (0.4: an ordinary step on a real site scores 0.35-0.55), or `abstain`: `blocked`.
6. **Check, where a step needs it.** *done*, or *goal reached* at 0.85 or more, asks a second
   check over the page's own text. It asks the decision model to name to itself the exact thing
   the goal asks for ("the sales phone number", not a phone number) and whether that thing is
   visible on the page now (a link to it, a related thing, or a different one of the same kind,
   such as the support number, is not); and, when lines of the page share the goal's words (up to
   six), which of them shows it, or none. It is done only at `confirmConfidence` or more *and*
   with a line picked; the step line quotes that line. With no such line (or no page text) the
   yes/no decides alone. That check is the safety: under `confirmConfidence` the run carries on (with
   the picked step, in the same step, for *goal reached*), and neither is taken on that same page
   again. *stuck* at 0.85 or more (or 0.6 while the last steps changed nothing) ends the run as
   `stuck`. Both are counted on the answer's `signals` line. A consequential step asks the tool
   gate's question about the goal (below).
7. **Act**, then observe again. The driver checks that the element still says what it said
   when observed; if the page changed, it looks again instead of acting. Before a click it checks
   that the element at the target's centre is the target, inside it, or its label: one covered by
   a banner or a dialog is not clicked; the step says what covers it.

## Safety rules

- **The decision model never writes text, selectors or URLs.** It picks a row. What gets typed
  comes from `inputs` alone.
- **Input values are never sent to the decision model, never logged, never stored.** They are
  handed to the browser's own process once (its standard input) or in a resume (a socket
  command); the mod holds them in memory only while that browser lives, to cut them out of
  everything it sends and keeps (requests, the band, the step lines). Requests carry the input's
  name (`[input:query]`). (The values are in the conversation already, since the model wrote
  them; and other plugins' `process` hooks could see a child's input, as they could any
  command's.)
- **The answer to the model shows the values it gave**: the URL, title and page text read as
  the page does ("Results for Clonostachys rosea", not "Results for [input:query]"). Except an
  input that looks secret: its name says password, pass, pin, otp, token, secret, key, card or
  cvv (and the like), or its value looks like a secret. That one stays `[input:<name>]`
  everywhere, the answer included.
- **Allowed hosts.** The start URL's host without `www.`, its subdomains, and `allowHosts`. A
  main-frame navigation elsewhere is aborted before it loads; a redirect that lands elsewhere
  stops the run (`left_allowlist`), and that page's text is not read.
- **Consequential steps.** A click or Enter whose label buys, pays, checks out, sends, replies,
  deletes, removes, cancels, posts, publishes, shares, signs up, registers, subscribes, confirms,
  accepts, books or applies, or that submits a form that is not a search, is taken only when
  **both** hold: the goal's own words name that kind of action, and the decision model answers at
  least `confirmConfidence` (0.85) that the goal asks for it ("Does the goal ask for this action to
  be done, or does it clearly follow from what the goal asks?", the tool gate's question put to the
  goal). Otherwise it stops as `needs_confirm`. A cookie banner is not consequential. Enter is a
  search, not a submit, in a search box: a field in no form, a search box or `role="search"`, a
  field whose label, placeholder or name says search, filter, find or query, or a form that is
  marked a search, is a `GET` form, or has a single text field (neither of those two with a
  password, email or text-area field). Enter in any other form is gated like its submit button.
- **A submit is never repeated blind.** A consequential step that was attempted and whose result
  is unknown (it failed or timed out, the page it went to failed to load, or the browser died
  mid-action) is recorded and not retried. The run stops as `needs_confirm` with an `attempted`
  line; from then on, in this call and any resume, every consequential step stops as
  `needs_confirm` until the person approves one. If the browser itself died, the answer is
  `failed` and says the same.
- **Approve is explicit.** `approve` does exactly that one action, the one the answer named, if
  the element still says the same; it is the model's job to ask the person first. An approved
  step is not gated again. A `blocked` option the agent approves is not gated at all: it runs
  directly, without the consequential-step check, so the agent decides and no person is asked.
- **Page content is data.** The model is told so in every answer; the decision model is told so
  in every request; injected instructions are withheld before either reads them. Console and
  network lines go to the model's answer only, never to the decision model: input values cut out,
  redacted, screened locally, 200 characters each, 50 per run (the rest are counted).
- **Fails closed for the browser, open for the session.** No key, private mode, the daily budget,
  a cool-off or a backend error ends the run as `failed` and closes the browser; nothing waits.
- **A project file cannot turn it on.** `browser` is the reverse of the guarding features: a
  project's `.claude/jev-mod.json` may only turn it off, and its settings (`allowAttach`,
  `confirmConfidence`, `stepFloor`, ...) come from your own file alone. A cloned repository cannot
  give the model a browser or lower its bar.

## Your own Chrome (`attach`)

By default every call gets a fresh headless Chromium on a throwaway profile, closed at the end:
no cookies, no sign-ins. To let a call use a browser where you are signed in:

1. `/jev-mod browser allowAttach true` (your own file only).
2. Start a Chrome with remote debugging on a **separate profile** (Chrome 136 and later refuse
   remote debugging on the default one):

   ```bash
   # macOS
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-jev"
   # Linux
   google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-jev"
   ```

   Sign in there to what the browser should use. Any program on this machine can drive a Chrome
   with remote debugging on: close it when you are done.
3. The endpoint is `http://127.0.0.1:9222` unless `JEV_MOD_BROWSER_CDP` names another (it must
   be on this machine). Set it in Claude Code's environment, e.g. `"env"` in `settings.json`.

A call with `attach: true` then opens a new tab there, works only in it (and in pop-ups it opens),
and closes it at the end; your browser is disconnected from, never closed. Without `allowAttach`
an `attach` call fails and says how to turn it on.

## Settings

| setting | default | |
|---|---|---|
| `maxSteps` | 20 (5-60) | the most steps one call takes; a call may ask for fewer |
| `confirmConfidence` | 0.85 (0.5-1) | the bar for a consequential step and for *done* |
| `stepFloor` | 0.4 (0.3-0.95) | under it, the call stops as `blocked`. A choice over a real page's table of 20-80 rows scores 0.35-0.55 for a good step, so 0.65 stopped nearly every step; consequential steps keep their own bar (`confirmConfidence`, and the goal naming the action). A named backend that sets `choose.min_confidence` in its `tuning` uses that instead, and `choose.dead_repeats` for how often a step may change nothing on a page before it is no longer offered (2) |
| `headed` | false | show the Chromium window |
| `allowAttach` | false | let a call drive your own Chrome |
| `textChars` | 6000 (1000-20000) | page text per step |

`JEV_MOD_BROWSER_DIR` names another folder holding `node_modules/playwright` (for development;
its Chromium is wherever that Playwright keeps it).

## Cost

Per step: one screening request for a page not seen before, one request (the choice and the two
yes/no signals together), and a yes/no when *done*, *goal reached* or a named consequential step
comes up. A bot check costs nothing. The calls count against the daily budget and show on the
band and in the dashboard under `browser` (`done`, `paused`, `failed`, `unverified`, `budget`,
`stuck`, `bot-check`, `goal-reached`, `left-allowlist`, `withheld`).

## Known gaps

Shadow roots, iframes, canvas, file uploads and drag-and-drop are not seen or done (a frame's
address is read only for the bot check). A popup
becomes the page. A site that changes its elements' labels as it renders can read as stale.

## Testing

`claude plugin test .` runs the rules (`rules.test.ts`) and the loop with a fake decision backend
and a fake driver (`index.test.ts`): the table, the allowlist, the consequential gate, blocked,
needs_input, the done check (a line must show the goal's thing), what was found along the way, resume and approve, screening and redaction, and that no input
value reaches any request or the store (and a secret-named one the answer); a bot check that
clears and one that does not (each provider's page is a fixture in `bots.fixture.ts`, with pages
that only look like one), goal reached and stuck stopping early, an unknown submit not repeated
across resume, console and network lines capped and redacted, and a covered button. The real driver
against local pages: `node src/features/browser/driver.check.mjs` (skips without Playwright),
including a single-page search box submitted by Enter whose results say "Loading data..." for a
second, a page whose text arrives late, which input a field holds, a button under a fixed banner,
a console error and a 404, visible frames, a page that polls, and a click whose result comes from
a request it starts. It prints the median time per kind of action.
