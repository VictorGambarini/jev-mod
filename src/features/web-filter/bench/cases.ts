// Decision-level cases for the web filter, in its two paths. Synthetic, written here.
//
// Search: a query, the person's request and a list of results; for each, whether it helps
// (gold). The first keepTop distinct results, a later copy of a URL and a result on a host the
// request names are never asked, so a case lists more results than the filter judges. Positive
// (dropped) = the result does not help.
//
// Fetch: a long page as sections, each labelled needed or not for the fetch's prompt and the
// request. The filter judges chunks of about 2,000 characters, so a chunk is needed when a good
// part of a needed section lies in it (the filter drops a unit only when every chunk holding it
// is dropped). Chunks it keeps without asking (the first, code, dates, figures, a named heading)
// are not scored. The sections avoid digits and code on purpose, so most chunks are asked about.
//
// The hard cases: a word that two topics share, a tangential page that does help, a thread
// complaining about the same error, a caveat low on the page, a comment that holds the fix.

export type Hit = { title: string; url: string; snippet: string; helps: boolean }

export type SearchCase = { id: string; kind: 'search'; query: string; request: string; hits: Hit[] }

export type FetchCase = {
  id: string
  kind: 'fetch'
  url: string
  prompt: string
  request: string
  sections: { text: string; needed: boolean }[]
}

export type WebCase = SearchCase | FetchCase

const h = (title: string, url: string, snippet: string, helps: boolean): Hit => ({ title, url, snippet, helps })

// ── search ───────────────────────────────────────────────────────────────────

const SEARCH: SearchCase[] = [
  {
    id: 'search-asyncio-timeout', kind: 'search', query: 'python asyncio timeout wait_for cancel task',
    request: 'My async function hangs sometimes. How do I put a timeout on it in Python?',
    hits: [
      h('asyncio wait_for - Python documentation', 'https://docs.python.org/3/library/asyncio-task.html', 'Wait for the awaitable to complete with a timeout. If a timeout occurs, it cancels the task and raises TimeoutError.', true),
      h('How to add a timeout to an awaitable', 'https://stackoverflow.com/q/1001', 'Use asyncio.timeout as a context manager or wait_for. Both cancel the inner task when the time is up.', true),
      h('Python async tutorial for beginners', 'https://pythonblog.example/async', 'A gentle introduction to coroutines, event loops and awaiting results.', true),
      h('Handling cancellation in asyncio', 'https://realpython.example/cancel', 'When a timeout cancels a task, CancelledError is raised inside it. Clean up in a finally block.', true),
      h('Top 10 Python IDEs', 'https://ides.example/top', 'Compare the most popular editors for Python development, with screenshots and prices.', false),
      h('Timeouts in JavaScript promises', 'https://js.example/timeouts', 'Wrap a promise with Promise.race and a timer to make it time out.', false),
      h('Buy cheap python books online', 'https://books.example/deal', 'Huge discounts on programming books. Free delivery on orders over a small amount.', false),
      h('asyncio gather and exceptions', 'https://stackoverflow.com/q/2002', 'What happens to the other tasks when one raises inside gather, and how return_exceptions changes it.', true),
    ],
  },
  {
    id: 'search-rust-borrow', kind: 'search', query: 'rust error E0502 cannot borrow as mutable because it is also borrowed as immutable',
    request: 'I get a borrow checker error when I push to a vector while holding a reference to an element. Explain.',
    hits: [
      h('Error code E0502 - Rust Compiler Error Index', 'https://doc.rust-lang.org/error_codes/E0502.html', 'A variable already borrowed as immutable was borrowed as mutable. Fix by ending the first borrow before the second.', true),
      h('Understanding ownership: references and borrowing', 'https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html', 'You cannot have a mutable reference while immutable references to the same value are in use.', true),
      h('Why can I not push while iterating?', 'https://stackoverflow.com/q/3003', 'Pushing may reallocate the vector, which would leave the reference dangling, so the compiler refuses.', true),
      h('Rust vs Go: which should you learn?', 'https://versus.example/rust-go', 'We compare syntax, speed and hiring prospects for two modern languages.', false),
      h('Rust game engine roundup', 'https://games.example/engines', 'A tour of engines written in Rust, from simple 2D libraries to full 3D frameworks.', false),
      h('Rust (video game) - survival tips', 'https://gamewiki.example/rust', 'How to survive your first night, build a base and craft tools in the survival game.', false),
      h('Clone or borrow? Fixing borrow errors the easy way', 'https://blog.example/clone-borrow', 'When an error is not worth restructuring for, clone the value; otherwise split the borrow or use indices.', true),
    ],
  },
  {
    id: 'search-mercury', kind: 'search', query: 'mercury orbit period around the sun',
    request: 'How long does it take Mercury to go around the Sun, and why is it so quick?',
    hits: [
      h('Mercury (planet) - Wikipedia', 'https://en.wikipedia.org/wiki/Mercury_(planet)', 'Mercury is the smallest planet and the closest to the Sun. Its orbital period is the shortest of all the planets.', true),
      h('Mercury facts - NASA Science', 'https://science.nasa.example/mercury', 'Mercury speeds around the Sun because it is so close and the Sun\'s gravity is strongest there.', true),
      h('Orbital periods of the planets', 'https://astro.example/periods', 'A table of how long each planet takes to complete an orbit, with the reasons from Kepler\'s third law.', true),
      h('Mercury poisoning: symptoms and treatment', 'https://health.example/mercury', 'Mercury in some fish can build up in the body. Learn the signs of exposure and when to see a doctor.', false),
      h('Mercury Records - artist catalogue', 'https://music.example/mercury', 'Browse the label\'s classic albums, from jazz to rock, and listen to samples.', false),
      h('Mercury Grand Marquis review', 'https://cars.example/marquis', 'A comfortable big sedan from the nineties, with a smooth ride and a large trunk.', false),
      h('Retrograde Mercury: what it means for your week', 'https://stars.example/retro', 'Astrologers say communication suffers when Mercury appears to move backwards. Here is how to cope.', false),
      h('Why do planets orbit at different speeds?', 'https://astro.example/speeds', 'Planets closer to the Sun move faster; the reasons are gravity and conservation of angular momentum.', true),
    ],
  },
  {
    id: 'search-k8s-crashloop', kind: 'search', query: 'kubernetes pod CrashLoopBackOff debug',
    request: 'Our pod keeps going into CrashLoopBackOff after the deploy. Where do I start looking?',
    hits: [
      h('Debug Pods - Kubernetes documentation', 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/', 'Start with kubectl describe pod and kubectl logs, including the previous container with --previous.', true),
      h('What is CrashLoopBackOff and how to fix it', 'https://blog.example/crashloop', 'Common causes are a failing start command, missing config or secrets, and probes that kill a healthy container.', true),
      h('Kubernetes pod lifecycle', 'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/', 'Pods move through phases; restart policy and back-off delay control how often a failed container is restarted.', true),
      h('Kubernetes certification study guide', 'https://certs.example/k8s', 'Prepare for the exam with practice questions, flash cards and a discount on the course.', false),
      h('Helm chart best practices', 'https://helm.example/best', 'Structure your charts, name values clearly, and test them with a linter before release.', false),
      h('OOMKilled containers: memory limits explained', 'https://blog.example/oom', 'A container that exceeds its memory limit is killed and restarted; check last state in describe output.', true),
      h('Kubernetes jobs of the future: hiring trends', 'https://jobs.example/k8s', 'Salaries and demand for platform engineers continue to grow in several regions.', false),
    ],
  },
  {
    id: 'search-hiking-named', kind: 'search', query: 'waterproof hiking boots review wide fit',
    request: 'Look at rei.com and tell me which waterproof hiking boots come in a wide fit.',
    hits: [
      h('Best waterproof hiking boots - tested', 'https://outdoorreviews.example/boots', 'Our testers walked hundreds of miles to find the most comfortable waterproof boots.', true),
      h('Wide hiking boots buying guide', 'https://trailblog.example/wide', 'How to choose a wide fit and which brands offer half sizes and extra volume.', true),
      h('Hiking boots - REI Co-op', 'https://www.rei.com/c/hiking-boots', 'Shop men\'s and women\'s hiking boots. Filter by width, waterproofing and activity.', true),
      h('Hiking boots sale at REI', 'https://www.rei.com/sale/boots', 'Seasonal discounts on last year\'s boots and trail shoes.', false),
      h('REI member dividends explained', 'https://www.rei.com/membership', 'Members earn a share back on purchases, plus access to rentals and classes.', false),
      h('Fashion boots for autumn', 'https://style.example/boots', 'Chelsea boots, knee-high styles and winter coats to match your wardrobe.', false),
      h('Hiking trails near the city', 'https://trails.example/near', 'A list of day hikes with maps, distances and parking details.', false),
    ],
  },
  {
    id: 'search-rebase-merge', kind: 'search', query: 'git rebase vs merge difference history',
    request: 'Explain the difference between git rebase and merge so I can pick one for my team.',
    hits: [
      h('Merging vs. Rebasing - Atlassian Git Tutorial', 'https://atlassian.example/git/merge-vs-rebase', 'Merge keeps history as it happened; rebase rewrites commits to give a linear history.', true),
      h('git-rebase documentation', 'https://git-scm.com/docs/git-rebase', 'Reapply commits on top of another base tip. Describes interactive mode and options.', true),
      h('Pro Git: Rebasing', 'https://git-scm.com/book/en/v2/Git-Branching-Rebasing', 'The perils of rebasing: do not rebase commits that exist outside your repository.', true),
      h('Git for designers', 'https://design.example/git', 'A friendly guide to version control for people who work with design files.', false),
      h('Squash merge, rebase merge and merge commit on GitHub', 'https://blog.example/github-merge', 'What each merge button does to history and which settings teams commonly choose.', true),
      h('Top Git GUI clients compared', 'https://tools.example/git-gui', 'Which graphical clients are fastest, and which support worktrees and submodules.', false),
      h('Git commit message cheat sheet', 'https://tips.example/commits', 'Write a short summary line, a blank line, then a body that explains why.', false),
      h('GitHub vs GitLab vs Bitbucket', 'https://versus.example/hosts', 'Pricing, features and integrations of three popular code hosts.', false),
    ],
  },
  {
    id: 'search-dups', kind: 'search', query: 'postgres index types btree gin gist',
    request: 'Which kind of index should I use for a JSONB column in Postgres?',
    hits: [
      h('Index Types - PostgreSQL documentation', 'https://www.postgresql.org/docs/current/indexes-types.html', 'PostgreSQL provides B-tree, Hash, GiST, SP-GiST, GIN and BRIN index types.', true),
      h('Index Types - PostgreSQL documentation', 'https://www.postgresql.org/docs/current/indexes-types.html', 'PostgreSQL provides B-tree, Hash, GiST, SP-GiST, GIN and BRIN index types.', true),
      h('JSON types - PostgreSQL documentation', 'https://www.postgresql.org/docs/current/datatype-json.html', 'jsonb supports GIN indexes, which can speed up containment and existence queries.', true),
      h('GIN indexes for JSONB', 'https://blog.example/gin-jsonb', 'Choose jsonb_ops for general queries or jsonb_path_ops for smaller indexes on containment.', true),
      h('GIN indexes for JSONB', 'https://blog.example/gin-jsonb', 'Choose jsonb_ops for general queries or jsonb_path_ops for smaller indexes on containment.', true),
      h('MySQL index tuning', 'https://mysql.example/index', 'Covering indexes, prefix lengths and the optimizer\'s use of statistics in MySQL.', false),
      h('Database careers: becoming a DBA', 'https://career.example/dba', 'What database administrators do, how to train, and what the day looks like.', false),
      h('When not to index: write-heavy tables', 'https://blog.example/no-index', 'Every index slows inserts and updates; drop the ones the planner never uses.', true),
    ],
  },
  {
    id: 'search-tailwind-dark', kind: 'search', query: 'tailwind css dark mode class strategy toggle',
    request: 'How do I add a dark mode toggle to my Tailwind site?',
    hits: [
      h('Dark Mode - Tailwind CSS', 'https://tailwindcss.com/docs/dark-mode', 'Use the dark variant to style elements in dark mode. Switch to the class strategy to toggle it manually.', true),
      h('Implementing a theme toggle with Tailwind', 'https://blog.example/tailwind-toggle', 'Add or remove the dark class on the html element and store the choice in localStorage.', true),
      h('Tailwind CSS installation', 'https://tailwindcss.com/docs/installation', 'Install with npm, create a config file and add the directives to your CSS.', true),
      h('Dark mode design principles', 'https://design.example/dark', 'Avoid pure black, keep contrast ratios readable, and desaturate bright colours.', true),
      h('Bootstrap 5 starter templates', 'https://themes.example/bootstrap', 'Free and premium templates for landing pages, dashboards and blogs.', false),
      h('Windows 11 dark mode settings', 'https://support.example/windows-dark', 'Open Settings, choose Personalisation, then Colours to switch the system theme.', false),
      h('Best dark chocolate brands', 'https://food.example/chocolate', 'A tasting of dark chocolate bars, ranked by flavour and cocoa content.', false),
    ],
  },
  {
    id: 'search-react-effect', kind: 'search', query: 'react useEffect cleanup function memory leak',
    request: 'Do I need to clean up in useEffect, and how, to avoid a memory leak warning?',
    hits: [
      h('useEffect - React reference', 'https://react.dev/reference/react/useEffect', 'Return a cleanup function to stop subscriptions, timers and requests when the component unmounts.', true),
      h('Synchronizing with effects', 'https://react.dev/learn/synchronizing-with-effects', 'Effects run after render; cleanup runs before the next effect and on unmount.', true),
      h('Fix: cannot perform a state update on an unmounted component', 'https://stackoverflow.com/q/4004', 'Cancel the fetch with an AbortController in the cleanup, or ignore the result after unmount.', true),
      h('React vs Vue in the enterprise', 'https://versus.example/react-vue', 'Where each framework fits, how teams train their staff, and how they handle long-term support.', false),
      h('Class components lifecycle diagram', 'https://react.example/lifecycle', 'Mounting, updating and unmounting in class components, compared with hooks.', true),
      h('React developer salary guide', 'https://jobs.example/react', 'Typical pay by region and years of experience.', false),
      h('How a garbage collector finds leaks', 'https://cs.example/gc', 'Reachability, roots and why forgotten references keep objects alive.', true),
    ],
  },
  {
    id: 'search-spam', kind: 'search', query: 'how to descale a kettle with vinegar',
    request: 'What is the safest way to descale my electric kettle?',
    hits: [
      h('How to descale a kettle - Which?', 'https://which.example/descale', 'Fill with equal parts water and white vinegar, boil, leave for twenty minutes, then rinse well.', true),
      h('Cleaning a kettle with citric acid', 'https://home.example/citric', 'Citric acid powder dissolves limescale without the smell of vinegar. Rinse and boil fresh water twice.', true),
      h('Kettle care instructions', 'https://maker.example/care', 'Do not immerse the base. Unplug before cleaning. Descale regularly in hard water areas.', true),
      h('Best kettles to buy this year', 'https://shop.example/kettles', 'Our picks of the fastest, quietest and most stylish electric kettles.', false),
      h('KETTLE!!! cheap kettle cheap kettles buy kettle online', 'https://spam.example/kettle', 'kettle kettle kettle best price kettle fast kettle shipping kettle click here kettle sale', false),
      h('Is vinegar safe? 10 shocking facts', 'https://clickbait.example/vinegar', 'You will not believe number seven. Doctors hate this one trick with a pantry staple.', false),
      h('Descaling a coffee machine', 'https://coffee.example/descale', 'Machines need a descaler made for them; vinegar can damage seals in some models.', true),
      h('History of the electric kettle', 'https://history.example/kettle', 'The first electric kettles appeared in the late nineteenth century and were slow and unreliable.', false),
    ],
  },
  {
    id: 'search-env-error', kind: 'search', query: 'ModuleNotFoundError no module named numpy after pip install',
    request: 'I installed numpy but Python still says no module named numpy. What is going on?',
    hits: [
      h('ModuleNotFoundError: No module named numpy', 'https://stackoverflow.com/q/5005', 'pip and python point at different interpreters. Run python -m pip install numpy to use the same one.', true),
      h('Virtual environments and pip', 'https://docs.python.org/3/tutorial/venv.html', 'Create an environment, activate it, and install packages into it so imports find them.', true),
      h('Installing NumPy', 'https://numpy.org/install', 'Use pip, conda, or your system package manager. Check the install with an import in Python.', true),
      h('Numpy arrays tutorial', 'https://tutorial.example/numpy', 'Create arrays, index them, and apply operations across whole arrays at once.', false),
      h('Same error in Jupyter - kernel not using the venv', 'https://reddit.example/r/learnpython/jupyter', 'My notebook says no module named numpy even though the terminal has it. The kernel points at another Python.', true),
      h('Python 2 end of life', 'https://news.example/py2', 'Python 2 has stopped receiving updates; migrate your projects to Python 3.', false),
      h('Learn Python in a weekend', 'https://course.example/weekend', 'An intensive course with exercises, a certificate and lifetime access.', false),
    ],
  },
  {
    id: 'search-tangent', kind: 'search', query: 'sqlite write lock database is locked error',
    request: 'My app gets "database is locked" from SQLite under load. How do I fix it?',
    hits: [
      h('SQLite - File Locking And Concurrency', 'https://sqlite.org/lockingv3.html', 'Only one writer at a time. Readers block writers in rollback mode; WAL mode lets them work together.', true),
      h('Write-Ahead Logging', 'https://sqlite.org/wal.html', 'WAL mode is often faster and allows readers to continue while a write is in progress.', true),
      h('busy_timeout pragma', 'https://sqlite.org/pragma.html#pragma_busy_timeout', 'Set how long a connection waits for a lock before returning SQLITE_BUSY.', true),
      h('SQLite vs PostgreSQL for small apps', 'https://versus.example/sqlite-pg', 'When a file database is enough and when a server database pays off, including concurrency limits.', true),
      h('SQLite release history', 'https://sqlite.org/changes.html', 'A list of changes in each release since the first public version.', false),
      h('Database is locked - Django ticket', 'https://code.example/django/ticket', 'Raising the timeout option in settings and keeping transactions short stops most lock errors.', true),
      h('SQL cheat sheet', 'https://cheat.example/sql', 'SELECT, JOIN, GROUP BY and window functions on one page.', false),
      h('Excel database templates', 'https://office.example/db', 'Free spreadsheet templates for tracking inventory, contacts and projects.', false),
    ],
  },
]

// ── fetch ────────────────────────────────────────────────────────────────────

// Parts of a page that are not for the question: kept here so the cases differ in what the
// question needs, not in the filler.
const NAV = 'Home   Products   Solutions   Pricing   Customers   Resources   About us   Careers   Contact   Sign in   Get started. Skip to main content. We use cookies to improve your experience and to show you relevant content. By continuing you accept our cookie policy; you can change your choices at any time from the link in the footer of every page.'
const NEWSLETTER = 'Subscribe to our newsletter. Join thousands of readers who get one short email every week with the best articles, tips and tools from our team. We never share your address and you can leave with one click. Follow us on all the usual networks, and tell a friend about us if you liked this page.'
const RELATED = 'Related articles. Ten habits of productive teams. Why the quarterly roadmap is dead. Our favourite books of the season. A visit to our new office. How we picked a new logo. Reader mailbag: your questions answered. Five podcasts to listen to on the train. Behind the scenes at the annual retreat.'
const FOOTER = 'About the company. Press. Investors. Terms of service. Privacy policy. Accessibility. Sitemap. Do not sell my information. All rights reserved by the publisher. Logos and names mentioned are the property of their owners. Site design by an independent studio; hosted in several regions.'
const COMMENTS = 'Comments. Great post, thanks for sharing! First. I disagree with the tone of the last section, but I enjoyed reading it. Does anyone know a good place to buy a desk? Sorry, off topic. Please moderate the spam above. Subscribed. Thanks, bookmarking this for later. Nice photos by the way.'
const BIO = 'About the author. Our writer has covered technology and daily life for many years, has a dog called Biscuit, and lives somewhere with too much rain. Reach out on social media or by email. Views here are the author\'s own and do not represent any employer or organisation mentioned.'
const SPONSOR = 'Sponsored. Meet the new all-in-one workspace that your team will actually enjoy using. Plan, write and track everything in one place, with templates for every kind of project. Start free today, no payment details needed, and upgrade whenever you like. Ask about our programme for schools and charities.'

const filler = (...parts: string[]) => parts.map(text => ({ text, needed: false }))
const need = (text: string) => ({ text, needed: true })

const FETCH: FetchCase[] = [
  {
    id: 'fetch-venv', kind: 'fetch', url: 'https://pyguide.example/venv',
    prompt: 'How do I create a virtual environment and activate it on Windows?',
    request: 'I am on Windows and want to set up a virtual environment for my project.',
    sections: [
      need('Python virtual environments. A virtual environment is a folder that holds its own copy of the interpreter and its own set of installed packages, so one project cannot break another. This guide explains how to create one, how to switch it on, and how to leave it again.'),
      need('Creating an environment. Open a terminal in your project folder and ask Python to create the environment with the venv module, giving it a folder name such as venv. On Windows the command is usually run through the py launcher; the result is a folder with a Scripts directory, a Lib directory and a configuration file. Do not move the folder afterwards, because the paths inside it are fixed when it is created.'),
      need('Activating it. On Windows, run the Activate script that lives inside the Scripts folder; in PowerShell you may first need to allow local scripts to run for your user. On Linux and macOS you source the activate file in the bin folder instead. The prompt then shows the name of the environment in brackets. To leave it, run the deactivate command, which is defined while the environment is active.'),
      ...filler(NAV + ' ' + SPONSOR, 'A short history of Python packaging. In the early years there was a single shared site directory and installing a library for one program changed it for all. Later tools such as easy install, setuptools and the wheel format changed how libraries are built and shipped, and the community argued for years about which workflow should win. Today most people use a small number of tools and the debate has calmed down a good deal. ' + RELATED, COMMENTS + ' ' + NEWSLETTER),
      need('Troubleshooting. If the Activate script is refused with an error about execution policy, change the policy for the current user only and try again. If pip installs into the wrong place, check that the prompt shows the environment name and that the python on your path is the one inside the Scripts folder. Deleting the folder removes the environment completely, and nothing else on the machine is touched.'),
      ...filler(BIO + ' ' + RELATED, FOOTER + ' ' + NEWSLETTER),
    ],
  },
  {
    id: 'fetch-sourdough', kind: 'fetch', url: 'https://bakers.example/dense-sourdough',
    prompt: 'Why is my sourdough loaf dense, and what should I change?',
    request: 'My sourdough comes out heavy with a tight crumb. What am I doing wrong?',
    sections: [
      need('Why is my sourdough dense? A dense loaf is the most common complaint of new bakers and almost always has one of a few causes. This page goes through them in order of how often we see them, so you can work out which applies to you.'),
      need('Starter that is not ready. If the starter has not doubled and does not float or look full of bubbles when you use it, the loaf will not rise well. Feed it, wait until it is at its peak, and use it then. A starter kept in the cold needs a couple of warm feedings first. This is the single biggest cause of tight, gummy crumb.'),
      need('Under fermentation. Dough that is shaped too early has not produced enough gas. Judge the dough, not the clock: it should look puffy, jiggle when the bowl is shaken, and show bubbles at the edge. A cold kitchen slows everything, so give the bulk rise more time in winter and less in summer.'),
      ...filler('Our favourite baking tools. A good Dutch oven, a bench scraper, a banneton and a sharp blade make the work pleasant, and none of them need to be expensive. We list our picks and where to find them, and we may earn a small commission if you buy through our links. ' + SPONSOR, NAV + ' ' + COMMENTS, 'Sourdough in popular culture. The bread has appeared in cookbooks, films and a long-running television show, and it has been the subject of countless magazine features. Some argue that the wave of home baking was a passing fashion; others say it taught a generation to enjoy slow food. ' + BIO),
      need('Weak shaping and a hot oven too late. If the loaf spreads sideways instead of up, the surface was not tight. Pull the dough toward you to build tension before the final rest. Start the oven early so the pot is fully hot, and keep the lid on for the first part of the bake to trap steam.'),
      ...filler(RELATED + ' ' + NEWSLETTER, FOOTER),
    ],
  },
  {
    id: 'fetch-retry-lib', kind: 'fetch', url: 'https://retrylib.example/docs/config',
    prompt: 'How does the library back off between retries, and which errors does it retry?',
    request: 'Set up retries in my HTTP client so it backs off and only retries errors that make sense.',
    sections: [
      need('Retry configuration. The client retries failed requests according to a policy. A policy answers three questions: which failures count, how long to wait, and when to stop. This page documents each setting and its default.'),
      need('Waiting between attempts. The delay grows exponentially: each wait is the base delay multiplied by the factor raised to the attempt number, up to a maximum delay. Jitter adds a random amount so many clients do not retry at the same moment. Set the factor to one for a fixed delay. A server that sends a Retry-After header overrides the computed wait.'),
      need('Which errors are retried. By default the client retries connection errors, timeouts and the server errors that signal a temporary problem, such as bad gateway, service unavailable and gateway timeout. It does not retry client errors, which would only fail again, and it does not retry requests with a body unless they are marked as safe to repeat.'),
      ...filler('Installation. Install the package with your package manager of choice, or download a release archive from the project page. Supported platforms are listed in the compatibility table, and older versions of the runtime are no longer tested. See the upgrade notes if you come from a previous major version. ' + NAV, 'Contributors. This project exists thanks to everyone who has contributed code, documentation, translations and bug reports. A list of names with links to profiles follows, in alphabetical order, along with the organisations that sponsor the work. Thank you all. ' + SPONSOR, 'License. The library is released under a permissive licence. You may use, copy, modify and distribute it, in source or binary form, with or without changes, provided that the copyright notice and permission notice appear in all copies. The software is provided as is, without warranty of any kind. ' + FOOTER),
      need('Stopping. Attempts stop after the maximum number of tries or when the total time budget is spent, whichever comes first. Set both: a policy with many tries but no time budget can keep a caller waiting for minutes. The last error is raised to the caller with the history of attempts attached, so you can log what happened.'),
      ...filler(COMMENTS + ' ' + RELATED, BIO + ' ' + NEWSLETTER),
    ],
  },
  {
    id: 'fetch-council', kind: 'fetch', url: 'https://localnews.example/council-bike-lanes',
    prompt: 'What did the council decide about the bike lanes, and who opposed it?',
    request: 'What did the city council decide on the Harbour Street bike lanes?',
    sections: [
      need('Council approves Harbour Street bike lanes after long debate. The city council voted on Tuesday night to build protected bike lanes along Harbour Street, ending months of argument between cyclists, shop owners and residents. The vote followed three hours of public comment.'),
      need('The decision. Councillors approved the plan by a narrow majority. The lanes will replace one lane of parking on each side, and the council asked staff to report back after a trial period on whether deliveries and bus stops are working. Work is expected to begin after the winter, subject to funding.'),
      need('Opposition. Two councillors voted against, saying the plan puts too much burden on small businesses that rely on street parking. A group of shop owners said they had not been properly consulted and warned of lost trade. Supporters replied that the street is among the most dangerous for cyclists in the city.'),
      ...filler('Sport. The local team won again on Saturday, extending its unbeaten run to the end of the month. The coach praised the defence and said the squad is in good spirits ahead of a difficult away fixture. Fans queued early for tickets to the next home match. ' + NEWSLETTER, 'Weather. Expect scattered showers on Thursday, clearing to a bright and breezy weekend. Overnight temperatures stay mild near the coast, with a chance of frost inland on Sunday morning. Gardeners are advised to cover tender plants. ' + NAV, 'More from the city. A new library branch opens next month. The farmers market moves to a larger site. Road works begin on the ring road. A school fundraiser raises money for a new playground. Readers share photographs of the autumn leaves. ' + RELATED),
      ...filler(COMMENTS + ' ' + SPONSOR, BIO + ' ' + FOOTER),
      need('What happens next. The trial design will be put out for comment, and a second vote is planned once staff have costed the options for the bus stops. Residents who want to give feedback can write to the council or attend the next open session.'),
    ],
  },
  {
    id: 'fetch-pricing', kind: 'fetch', url: 'https://saasapp.example/pricing',
    prompt: 'Does the free plan include API access, and what are its limits?',
    request: 'Check whether the free plan of this product includes API access.',
    sections: [
      need('Pricing. Choose the plan that fits your team. Every plan includes unlimited viewers, version history and our mobile app. Compare features below, or talk to sales if you need something custom.'),
      need('Free plan. The free plan is for individuals and small projects. It includes up to three projects, basic reporting, community support, and read-only API access with a modest daily request limit. Write access to the API, webhooks and single sign-on are not included and need a paid plan.'),
      need('Team plan. The team plan adds unlimited projects, full read and write API access with a higher rate limit, webhooks, audit logs and priority email support. Admins can manage seats and roles from the settings page. Billing is per seat and can be monthly or yearly.'),
      ...filler('Trusted by teams everywhere. Companies of every size use the product to plan work, ship faster and keep everyone informed. Read stories from agencies, schools, start-ups and large enterprises. Logos of customers appear below in a carousel, and a quote from a happy manager follows. ' + SPONSOR, 'Frequently asked questions about data. Where is my data stored? Can I export it? Do you sell it? We store data in regions you choose, you can export everything at any time in standard formats, and we never sell personal information. See the privacy policy for details. ' + NAV, 'Our story. The company began as a side project of three friends who were tired of messy spreadsheets. Over the years it grew into a team spread across several countries, with a culture built on curiosity and kindness. Read about our values and open roles. ' + FOOTER),
      ...filler(RELATED + ' ' + NEWSLETTER, COMMENTS),
      need('Fair use. API requests on any plan are subject to fair use limits, and free plan keys may be paused if they are shared publicly. Create a separate key for each integration and rotate keys that leak. Limits are shown in your account settings and reset every day.'),
    ],
  },
  {
    id: 'fetch-rebase', kind: 'fetch', url: 'https://gitblog.example/what-rebase-does',
    prompt: 'What does git rebase do to the commit history, and when is it unsafe?',
    request: 'Explain what git rebase does to my commits and whether I can use it on a shared branch.',
    sections: [
      need('What git rebase does. Rebase takes the commits of your branch and replays them, one by one, on top of another commit. The content of each change stays the same, but each commit is made again with a new parent, so it gets a new identity. The result is a history that looks as though you started your work from the newest base.'),
      need('Compared with merging. A merge keeps the branches as they were and adds a commit that joins them. A rebase gives a straight line without that extra commit, which many people find easier to read. The price is that history is rewritten: the old commits still exist for a while, but nothing points at them any more.'),
      need('The golden rule. Never rebase commits that other people have already based work on. If you rewrite a shared branch, their copies no longer match yours, and everyone has to untangle the difference by hand. Rebase freely on your own local branches before you share them, and use a merge or a revert once the work is public.'),
      ...filler('Master version control in a weekend. Our video course covers branching, merging, rebasing, stashing and fixing mistakes, with hands-on exercises and a certificate of completion. Join the waiting list and receive a discount on launch day. ' + SPONSOR, BIO + ' ' + NAV, 'More from the blog. How to name branches so your team can find them. Ten useful aliases. A tour of the reflog. Why commit messages matter. Setting up signing for commits. Our favourite terminal themes. A guide to the tools in the editor. ' + RELATED),
      need('Recovering from a mistake. If a rebase goes wrong you can usually undo it: the reflog records where your branch pointed before, and a reset to that entry restores the old history. Abort a rebase that is in progress with the abort option rather than trying to repair it by hand.'),
      ...filler(COMMENTS + ' ' + NEWSLETTER, FOOTER + ' ' + RELATED),
    ],
  },
  {
    id: 'fetch-bridge', kind: 'fetch', url: 'https://encyclopedia.example/old-harbour-bridge',
    prompt: 'Who designed the Old Harbour Bridge and why was it built that way?',
    request: 'Who designed the Old Harbour Bridge?',
    sections: [
      need('Old Harbour Bridge. The Old Harbour Bridge is a steel arch bridge that carries road and rail traffic across the harbour, and it is one of the best known landmarks of the city. It stands beside the old customs house and has been a symbol of the region since it opened.'),
      need('Design. The bridge was designed by the engineer Marta Lindqvist, who chose a through arch because the soft ground on the north shore could not carry the weight of a suspension bridge anchorage. Her team tested models of the arch in a wind tunnel, and the shape of the deck was altered after the tests to reduce vibration.'),
      ...filler('In popular culture. The bridge appears in several films, music videos and novels, and is a favourite subject for painters. A local choir sings from its walkway every winter solstice, and fireworks are launched from it on the national day each year. Postage stamps have shown its outline. ' + NAV, 'Gallery. View from the north shore at dusk. The arch seen from a ferry. Detail of the riveted steel. The pedestrian path in the rain. Fog over the harbour. Workers painting the girders. A train crossing the lower deck. Tourists on the viewing platform. ' + RELATED, 'See also. List of arch bridges. List of bridges in the country. Harbour ferries. The customs house. Industrial heritage sites. Timeline of the city. Categories: bridges, landmarks, steel structures, tourist attractions. ' + FOOTER, 'References. Lists of books, newspapers and websites that were used to write this article, with page references and archive links. External links lead to the bridge authority, a tourism site and a photo collection. Edit this page. Discuss this page. ' + COMMENTS),
      need('Construction and later changes. Building began after the design was approved and took several years, with crews working from both shores towards the middle. The bridge was widened and strengthened after the war, and the original designer\'s drawings are kept in the city archive. A restoration in recent years repaired the steel without changing the arch.'),
      ...filler(NEWSLETTER + ' ' + BIO, SPONSOR + ' ' + COMMENTS),
    ],
  },
]

// Long pages: a stretch of the boilerplate above (rotated, so cases differ) goes in after the
// second section and another before the last needed one, so the needed parts are spread over the
// page and some chunks are wholly beside the point.
const POOL = [NAV, NEWSLETTER, RELATED, FOOTER, COMMENTS, BIO, SPONSOR]
const pad = (k: number) => filler(POOL.slice(k % 7).concat(POOL.slice(0, k % 7)).join(' '))
for (const [k, c] of FETCH.entries()) {
  const last = c.sections.map(s => s.needed).lastIndexOf(true)
  c.sections.splice(last, 0, ...pad(k + 3))
  c.sections.splice(2, 0, ...pad(k))
}

export const CASES: WebCase[] = [...SEARCH, ...FETCH]
