// Decision-level cases for skills: a catalog of installed skills (synthetic names and
// descriptions, in the style of a SKILL.md front matter), and prompts with the skills that are
// the right procedure for them (gold; none when no listed skill is). Where two skills are fair
// answers, both are in the gold list. Synthetic, written here.

import type { Skill } from '../../../engine/skills'

const skill = (name: string, description: string): Skill => ({ name, description, path: `/skills/${name}/SKILL.md` })

export const CATALOG: Skill[] = [
  skill('pdf-extract', 'Extract text, tables and form fields from PDF files, fill in PDF forms, merge and split PDFs.'),
  skill('xlsx-builder', 'Create and edit Excel spreadsheets with formulas, formatting, pivot-style summaries and charts.'),
  skill('docx-writer', 'Create and edit Word documents with headings, tables, tracked changes and comments.'),
  skill('pptx-deck', 'Build PowerPoint slide decks from an outline, with layouts, images and speaker notes.'),
  skill('db-migration-safe', 'Plan and write database schema migrations that run without downtime: expand and contract, backfills, rollbacks.'),
  skill('api-design-review', 'Review REST and GraphQL API designs for naming, versioning, pagination, error shapes and backward compatibility.'),
  skill('security-review', 'Review code changes for security problems: injection, missing authorisation checks, unsafe deserialisation, exposed credentials.'),
  skill('code-review', 'Review a pull request or diff for correctness, readability, test coverage and risk.'),
  skill('tdd-loop', 'Test-driven development: write a failing test first, make it pass, refactor, in small steps.'),
  skill('debug-systematic', 'Diagnose hard bugs: reproduce, minimise, form hypotheses, instrument, fix, and add a regression test.'),
  skill('perf-profiling', 'Find and fix performance problems with profilers, flame graphs and benchmarks.'),
  skill('git-release', 'Prepare a release: bump the version, update the changelog, tag, and publish the artifacts.'),
  skill('git-conflicts', 'Resolve merge and rebase conflicts safely and explain what each side changed.'),
  skill('commit-messages', 'Write clear conventional commit messages and pull request descriptions from a diff.'),
  skill('docker-setup', 'Write Dockerfiles and docker-compose files: slim images, layer caching, health checks.'),
  skill('k8s-deploy', 'Write Kubernetes manifests and Helm charts: rollouts, probes, resource limits.'),
  skill('ci-pipelines', 'Build and fix CI pipelines in GitHub Actions: caching, build matrices, flaky jobs.'),
  skill('terraform-infra', 'Write and review Terraform modules; handle state, plans and configuration drift.'),
  skill('react-components', 'Build React components with hooks, state management and accessible markup.'),
  skill('css-layout', 'Fix CSS layout problems: flexbox, grid, responsive breakpoints, overflow and stacking.'),
  skill('a11y-audit', 'Audit web pages for accessibility: colour contrast, keyboard use, ARIA roles, screen readers.'),
  skill('playwright-e2e', 'Write and debug end-to-end browser tests with Playwright.'),
  skill('sql-optimise', 'Write and optimise SQL queries: indexes, EXPLAIN plans, joins, window functions.'),
  skill('pandas-analysis', 'Analyse tabular data with pandas: cleaning, grouping, summary statistics and quick plots.'),
  skill('ml-training', 'Train and evaluate machine-learning models: train and test splits, metrics, leakage, hyperparameters.'),
  skill('dataviz-charts', 'Design clear charts and dashboards: choosing chart types, colours, labels and layout.'),
  skill('api-docs-writer', 'Write API reference pages and how-to documentation from the code.'),
  skill('readme-writer', 'Write a README: installation, quick start, examples and how to contribute.'),
  skill('release-notes', 'Write user-facing release notes from commits and closed issues.'),
  skill('python-packaging', 'Package Python projects: pyproject.toml, wheels, versioning, publishing to PyPI.'),
  skill('rust-ownership', 'Fix Rust borrow checker and lifetime errors and explain ownership.'),
  skill('shell-scripting', 'Write safe, portable bash scripts: quoting, error handling, argument parsing.'),
  skill('regex-helper', 'Write and explain regular expressions, with test strings for each.'),
  skill('llm-prompting', 'Design prompts and evals for LLM features: structure, few-shot examples, output formats.'),
  skill('incident-postmortem', 'Write blameless incident postmortems: timeline, impact, contributing causes, follow-up actions.'),
  skill('i18n-setup', 'Internationalise an app: extract strings, plural rules, date and number formats per locale.'),
  skill('oauth-integration', 'Implement OAuth 2.0 and OpenID Connect sign-in with a provider: scopes, redirects, token refresh.'),
  skill('web-scraping', 'Scrape websites politely: parse HTML, follow pagination, respect rate limits and robots.txt.'),
]

export type SkillCase = {
  id: string
  prompt: string
  /** The skills that are a right answer; empty when no listed skill is one. */
  gold: string[]
  /** The prompt is arguable: a second skill, or none, would not be a clear mistake. */
  borderline?: true
}

export const CASES: SkillCase[] = [
  // a clear match
  { id: 'pdf-tables', gold: ['pdf-extract'], prompt: 'Pull the tables out of the attached annual report PDF into CSV files, one per table.' },
  { id: 'pdf-form', gold: ['pdf-extract'], prompt: 'Fill in the fields of tax-form.pdf from this JSON and save the result as a new PDF.' },
  { id: 'xlsx-formulas', gold: ['xlsx-builder'], prompt: 'Make a budget spreadsheet with a tab per month, SUM formulas for each category and a chart of spending over the year.' },
  { id: 'docx-report', gold: ['docx-writer'], prompt: 'Turn these notes into a Word document with a title page, numbered headings and a table of milestones.' },
  { id: 'docx-track', gold: ['docx-writer'], prompt: 'Open contract.docx and make my edits as tracked changes, with a comment on each clause I changed.' },
  { id: 'deck-outline', gold: ['pptx-deck'], prompt: 'Build a ten-slide deck from this outline for tomorrow\'s board meeting, with speaker notes.' },
  { id: 'zero-downtime-migration', gold: ['db-migration-safe'], prompt: 'I need to rename the users.fullname column to users.display_name on a live Postgres with no downtime and a way back.' },
  { id: 'backfill', gold: ['db-migration-safe'], prompt: 'Add a NOT NULL column with a default to the 80-million-row orders table without locking it. How should the migration be staged?' },
  { id: 'api-review', gold: ['api-design-review'], prompt: 'Here is our draft OpenAPI spec for the v2 orders API. Is the pagination and the error format sensible, and will it break v1 clients?' },
  { id: 'sec-diff', gold: ['security-review'], prompt: 'Review this diff for security problems before I merge it: it adds a file upload endpoint and a shell call to convert images.' },
  { id: 'pr-review', gold: ['code-review'], prompt: 'Can you review PR 482 for correctness and test coverage?' },
  { id: 'tdd-new', gold: ['tdd-loop'], prompt: 'Let\'s build the invoice rounding function test-first. Start with a failing test.' },
  { id: 'bug-hard', gold: ['debug-systematic'], prompt: 'The nightly export randomly produces an empty file. I can\'t reproduce it. Help me narrow it down step by step and add a test once we find it.' },
  { id: 'slow-endpoint', gold: ['perf-profiling'], prompt: 'The /search endpoint takes 3 seconds. Profile it and tell me where the time goes.' },
  { id: 'cut-release', gold: ['git-release'], prompt: 'Cut release 2.4.0: bump the version, update the changelog, tag it and publish.' },
  { id: 'rebase-conflicts', gold: ['git-conflicts'], prompt: 'My rebase onto main stopped with conflicts in four files. Resolve them and tell me what each side changed.' },
  { id: 'commit-text', gold: ['commit-messages'], prompt: 'Write a conventional commit message for the staged changes.' },
  { id: 'dockerfile', gold: ['docker-setup'], prompt: 'Write a Dockerfile for this Node app that builds small and caches dependencies, plus a compose file with Postgres.' },
  { id: 'helm-chart', gold: ['k8s-deploy'], prompt: 'Create a Helm chart for the API with readiness probes, resource limits and a rolling update strategy.' },
  { id: 'actions-cache', gold: ['ci-pipelines'], prompt: 'Our GitHub Actions workflow takes 18 minutes. Add dependency caching and run the tests in a matrix over Node 20 and 22.' },
  { id: 'terraform-module', gold: ['terraform-infra'], prompt: 'Write a Terraform module for an S3 bucket with versioning and a lifecycle rule, and show me what `plan` should say.' },
  { id: 'react-hook', gold: ['react-components'], prompt: 'Build a React Combobox component with keyboard navigation and a useDebounce hook for the search input.' },
  { id: 'flex-overflow', gold: ['css-layout'], prompt: 'The sidebar overflows its container on narrow screens and the grid collapses badly below 600px. Fix the CSS.' },
  { id: 'a11y-page', gold: ['a11y-audit'], prompt: 'Check our checkout page for accessibility problems: contrast, tab order, and whether a screen reader can use the form.' },
  { id: 'e2e-login', gold: ['playwright-e2e'], prompt: 'Write a Playwright test that logs in, adds an item to the cart and checks the total.' },
  { id: 'sql-explain', gold: ['sql-optimise'], prompt: 'This query takes forever. Here is the EXPLAIN output. Which index would help?' },
  { id: 'pandas-clean', gold: ['pandas-analysis'], prompt: 'Load sales.csv, drop duplicate rows, fill missing regions, and give me revenue by region and quarter.' },
  { id: 'train-model', gold: ['ml-training'], prompt: 'My classifier gets 99 percent on validation but 70 percent in production. Check my train and test split for leakage.' },
  { id: 'chart-choice', gold: ['dataviz-charts'], prompt: 'What is the best chart for showing monthly churn against ad spend, and how should I colour and label it?' },
  { id: 'api-reference', gold: ['api-docs-writer'], prompt: 'Generate API reference docs for the public functions in src/sdk/ with an example for each.' },
  { id: 'write-readme', gold: ['readme-writer'], prompt: 'This repo has no README. Write one with install steps, a quick start and a contributing section.' },
  { id: 'py-publish', gold: ['python-packaging'], prompt: 'Convert setup.py to pyproject.toml, build a wheel and tell me how to publish it to PyPI.' },
  { id: 'borrow-error', gold: ['rust-ownership'], prompt: 'rustc says "cannot borrow `self.items` as mutable because it is also borrowed as immutable". Explain and fix.' },
  { id: 'bash-script', gold: ['shell-scripting'], prompt: 'Write a bash script that backs up a folder to a dated tarball, takes the folder as an argument and exits cleanly on errors.' },
  { id: 'regex-date', gold: ['regex-helper'], prompt: 'Write a regex that matches ISO dates like 2026-03-07 but not 2026-13-07, with test strings.' },
  { id: 'prompt-design', gold: ['llm-prompting'], prompt: 'Design the prompt and a small eval set for a feature that tags support tickets with one of eight categories, returning JSON.' },
  { id: 'postmortem', gold: ['incident-postmortem'], prompt: 'Write a blameless postmortem for last Tuesday\'s 40-minute outage. I have the timeline in notes.md.' },
  { id: 'i18n', gold: ['i18n-setup'], prompt: 'Extract the hard-coded strings in the app into translation files, and handle plurals and date formats for French and Japanese.' },
  { id: 'oauth', gold: ['oauth-integration'], prompt: 'Add "Sign in with Google" using OpenID Connect, including the redirect handler and refreshing the session.' },
  { id: 'scrape', gold: ['web-scraping'], prompt: 'Scrape the product listings from example-shop.test across all pages, politely, into a JSON file.' },

  // two skills are fair
  { id: 'borderline-release-notes', gold: ['release-notes', 'git-release'], borderline: true, prompt: 'Write the notes for version 3.1 from the merged PRs since the last tag.' },
  { id: 'borderline-readme-api', gold: ['readme-writer', 'api-docs-writer'], borderline: true, prompt: 'Document how to use the client library: install it, authenticate, and call the main functions.' },
  { id: 'borderline-review-sec', gold: ['code-review', 'security-review'], borderline: true, prompt: 'Look over my changes to the login handler before I open the PR.' },
  { id: 'borderline-slow-sql', gold: ['sql-optimise', 'perf-profiling'], borderline: true, prompt: 'The report page is slow and I think it is the database. Find out why.' },
  { id: 'borderline-ci-docker', gold: ['ci-pipelines', 'docker-setup'], borderline: true, prompt: 'The image build in CI takes twelve minutes every time. Make it faster.' },
  { id: 'borderline-chart-deck', gold: ['dataviz-charts', 'pptx-deck'], borderline: true, prompt: 'Make the quarterly numbers into something I can show the team: a chart or two on a few slides.' },
  { id: 'borderline-bug-test', gold: ['debug-systematic', 'tdd-loop'], borderline: true, prompt: 'The refund total is wrong when a coupon and a gift card are both used. Write a test that fails, then fix it.' },
  { id: 'borderline-oauth-sec', gold: ['oauth-integration', 'security-review'], borderline: true, prompt: 'Is our OAuth redirect handling safe? Check the redirect_uri checks and state parameter.' },

  // no listed skill fits: ordinary work for the model alone
  { id: 'none-rename', gold: [], prompt: 'Rename the function getUser to fetchUser everywhere in src/.' },
  { id: 'none-explain', gold: [], prompt: 'Explain what the debounce function in utils.ts does.' },
  { id: 'none-small-fix', gold: [], prompt: 'There is an off-by-one in the loop on line 52 of pager.ts. Fix it.' },
  { id: 'none-question', gold: [], prompt: 'What is the difference between a mutex and a semaphore?' },
  { id: 'none-add-field', gold: [], prompt: 'Add an optional `nickname` field to the User type and the form that edits it.' },
  { id: 'none-run-tests', gold: [], prompt: 'Run the tests and tell me what failed.' },
  { id: 'none-summary', gold: [], prompt: 'Summarise what changed in this branch compared with main.' },
  { id: 'none-haiku', gold: [], prompt: 'Write me a haiku about Monday mornings.' },
  { id: 'none-delete-file', gold: [], prompt: 'Delete the old fixtures folder and update the import in the test helper.' },
  { id: 'none-typo', gold: [], prompt: 'Fix the typo "recieve" in the error message in src/errors.ts.' },
  { id: 'none-go', gold: [], prompt: 'Translate this Go function to Python, keeping the same names.' },
  { id: 'none-config', gold: [], prompt: 'Change the default port from 3000 to 8080 in the config and the docs.' },
  { id: 'borderline-none-test', gold: [], borderline: true, prompt: 'Add a test for the slugify function.' },
  { id: 'borderline-none-docs', gold: [], borderline: true, prompt: 'Add a short docstring to every exported function in this file.' },
  { id: 'borderline-none-refactor', gold: [], borderline: true, prompt: 'Split this 300-line function into smaller ones.' },

  // a close wrong neighbour: shares words with a skill and is not what it is for
  { id: 'near-pdf-render', gold: [], borderline: true, prompt: 'Why does my React component render twice in development?' },
  { id: 'near-docker-word', gold: [], prompt: 'What is a good name for a function that docks a ship\'s position to the nearest port?' },
  { id: 'near-release-word', gold: [], prompt: 'Release the lock in the cache module when the callback throws.' },
  { id: 'near-migration-word', gold: [], prompt: 'Migrate this one-off script from print statements to the logging module.' },
  { id: 'near-security-word', gold: [], borderline: true, prompt: 'Add a type annotation to the `secure` flag in the cookie options helper.' },
  { id: 'near-sql-word', gold: [], prompt: 'Rename the SQL file in migrations/ so it sorts after the latest one.' },

  // turns the gate answers without asking
  { id: 'trivial-ok', gold: [], prompt: 'ok thanks' },
  { id: 'trivial-go', gold: [], prompt: 'go ahead' },
  { id: 'trivial-next', gold: [], prompt: 'next' },
]
