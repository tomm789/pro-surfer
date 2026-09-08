# Working on LINE-UP with Codex

Codex reads `AGENTS.md` automatically from the repository root; that file is the rulebook. This page is the setup checklist for the ChatGPT desktop app and for Codex cloud, plus the kickoff prompt.

## 1. Local prerequisites (Mac)

```bash
# Node 22 or newer (node -v). Install via https://nodejs.org or `brew install node@22`.
git clone https://github.com/tomm789/pro-surfer.git
cd pro-surfer
bash scripts/setup.sh        # npm ci, Playwright's Chromium for the headless tools, npm run check
npm run dev                  # http://localhost:5173 to play it yourself
```

`scripts/setup.sh` ends with `npm run check`; it must print the test count and a successful build. If Playwright's browser download is blocked, set `SKIP_BROWSER=1` and the headless screenshot tools will not be available (tests and build still work).

## 2. ChatGPT desktop app (Codex on your Mac)

1. Open the ChatGPT app, go to **Codex**, and add the cloned `pro-surfer` folder as the project (New thread → choose the folder). Codex works on that checkout directly.
2. Model: the latest Codex model offered, with **reasoning effort high** (or "extended thinking" if that is the label in your build). The tasks here are large and visual; low effort produces shallow work.
3. Approval / sandbox mode: choose the mode that lets Codex **edit files and run commands in the project folder without asking each time**, and that **allows network access** for `npm ci` and `npx playwright install` (in some builds this is called "Full access"; "Auto" mode may prompt for the network the first time, which is fine). Do not use read-only mode.
4. Branching: keep `main` clean. Ask Codex to create a branch per task (the prompt below does). Merge through pull requests on GitHub so CI runs `npm run check`, the smoke test and screenshots.
5. Optional: open the same folder in VS Code or Cursor with the Codex extension to review diffs side by side.

## 3. Codex cloud (chatgpt.com/codex)

1. Connect GitHub and pick `tomm789/pro-surfer`.
2. Environment: default universal image, Node 22.
3. Setup script: `bash scripts/setup.sh`
4. Agent internet access: **on during setup** (dependencies and the Chromium download). Turn it off for the agent phase if you prefer; everything the tools need is local after setup.
5. Codex cloud opens pull requests for each task; CI runs on them. Review the `screenshots` workflow artifact before merging visual changes.

## 4. Kickoff prompt

Paste this as the first message in a new Codex thread (desktop or cloud):

```
You are joining the LINE-UP project, an original browser surf trick game (TypeScript, Three.js, Vite). Read AGENTS.md first and follow it exactly; then read docs/MECHANICS.md (the control-to-body source of truth: each stick is a foot), docs/DESIGN.md (the spec), docs/PLAN.md and docs/BACKLOG.md.

Ground rules that matter most: original IP only; the simulation folders stay free of DOM, three and Math.random; every tunable goes in data/tuning.json with its zod schema; content is data under data/; npm run check must stay green; every visual change is verified with a headless screenshot you actually open and look at, every gameplay change with a test or the feel report, every flow change with npm run smoke.

Start by verifying the environment: run bash scripts/setup.sh, then npm run shot -- --scene game --flow ride --auto 1 --t 8 --out artifacts/baseline-ride.png and npm run smoke. Tell me the test count, the smoke result, and describe what the baseline screenshot looks like.

Then work through docs/BACKLOG.md from the top. Before each item, write your plan in a few sentences and record the item under "In progress" in docs/BACKLOG.md with your branch name. Work on a branch named codex/<topic> off main, in small commits with clear messages, and open a pull request against main for each item with before/after screenshots and the numbers you measured. Do not widen a PR beyond its item. When an item is done, move it to "Done" in the backlog with the PR number.

The P0 section of the backlog is a controller session that only a human can do: do not change the numbers in data/tuning.json under stance, recognizer or camera on your own — those are decided with a pad in hand. Start with the P1 items (the visual identity: beaches, the wave, the HUD and menus) and the engineering items, in backlog order. For anything that touches the character or the wave, take a screenshot before and after with the same command and put both in the PR. Any gameplay change must keep tests/onboarding.test.ts, tests/stance.test.ts and tests/feel.test.ts passing and must quote the feel report's dualPump, dualPop, dualRail and dualTwist numbers before and after.

If anything in the docs conflicts with the code, the design doc wins for gameplay rules and AGENTS.md wins for process; say so in the PR. Ask me only when a decision genuinely needs a human; otherwise make the call, state your assumption, and keep going.
```

## 5. Reviewing Codex's work

- Every PR: CI green, `screenshots` artifact opened and compared, diff read for hard-coded numbers and rule breaks (DOM or `three` in simulation folders, `Math.random` in the sim).
- Merge into `main`. Vercel deploys `main` as a preview until the project's production branch is switched to `main` (Vercel project → Settings → Git → Production Branch).
- Claude and Codex both work here. Keep `AGENTS.md` and `docs/BACKLOG.md` as the shared state; do not let either agent rewrite tuning wholesale without the numbers to justify it.
