// Generated from skills.json by tools/parity/to_ts.py. Do not edit.
export default {
 "catalog": [
  {
   "description": "Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
   "name": "jev-browser-use",
   "path": "/home/victor/github/jev-skills/skills/jev-browser-use/SKILL.md"
  },
  {
   "description": "Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
   "name": "jev-compaction",
   "path": "/home/victor/github/jev-skills/skills/jev-compaction/SKILL.md"
  },
  {
   "description": "Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
   "name": "jev-computer-use",
   "path": "/home/victor/github/jev-skills/skills/jev-computer-use/SKILL.md"
  },
  {
   "description": "Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
   "name": "jev-frontier-work",
   "path": "/home/victor/github/jev-skills/skills/jev-frontier-work/SKILL.md"
  },
  {
   "description": "Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
   "name": "jev-mailbox",
   "path": "/home/victor/github/jev-skills/skills/jev-mailbox/SKILL.md"
  },
  {
   "description": "Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
   "name": "jev-memory",
   "path": "/home/victor/github/jev-skills/skills/jev-memory/SKILL.md"
  },
  {
   "description": "Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
   "name": "jev-model-routing",
   "path": "/home/victor/github/jev-skills/skills/jev-model-routing/SKILL.md"
  },
  {
   "description": "Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
   "name": "jev-search",
   "path": "/home/victor/github/jev-skills/skills/jev-search/SKILL.md"
  },
  {
   "description": "Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
   "name": "jev-setup",
   "path": "/home/victor/github/jev-skills/skills/jev-setup/SKILL.md"
  },
  {
   "description": "Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
   "name": "jev-skill-select",
   "path": "/home/victor/github/jev-skills/skills/jev-skill-select/SKILL.md"
  },
  {
   "description": "Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
   "name": "jev-social-research",
   "path": "/home/victor/github/jev-skills/skills/jev-social-research/SKILL.md"
  }
 ],
 "runs": [
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "read this mailbox export and sort every message into a lane"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "read this mailbox export and sort every message into a lane"
     }
    }
   ],
   "result": {
    "needs_skill": 0.9,
    "skills": [
     {
      "match": 0.88,
      "name": "jev-browser-use",
      "path": "/home/victor/github/jev-skills/skills/jev-browser-use/SKILL.md"
     }
    ],
    "status": "ok"
   },
   "turn": "read this mailbox export and sort every message into a lane",
   "values": {
    "needs_skill": 0.9,
    "s0": 0.88
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "read this mailbox export and sort every message into a lane"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "read this mailbox export and sort every message into a lane"
     }
    }
   ],
   "result": {
    "needs_skill": 0.2,
    "skills": [],
    "status": "ok"
   },
   "turn": "read this mailbox export and sort every message into a lane",
   "values": {
    "needs_skill": 0.2,
    "s0": 0.88
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "read this mailbox export and sort every message into a lane"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "read this mailbox export and sort every message into a lane"
     }
    }
   ],
   "result": {
    "needs_skill": 0.9,
    "skills": [],
    "status": "ok"
   },
   "turn": "read this mailbox export and sort every message into a lane",
   "values": {
    "needs_skill": 0.9,
    "s0": 0.3
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "read this mailbox export and sort every message into a lane"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "read this mailbox export and sort every message into a lane"
     }
    }
   ],
   "result": {
    "needs_skill": 0.05,
    "skills": [],
    "status": "ok"
   },
   "turn": "read this mailbox export and sort every message into a lane",
   "values": {}
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "click through the checkout flow in the browser"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "click through the checkout flow in the browser"
     }
    }
   ],
   "result": {
    "needs_skill": 0.9,
    "skills": [
     {
      "match": 0.88,
      "name": "jev-browser-use",
      "path": "/home/victor/github/jev-skills/skills/jev-browser-use/SKILL.md"
     }
    ],
    "status": "ok"
   },
   "turn": "click through the checkout flow in the browser",
   "values": {
    "needs_skill": 0.9,
    "s0": 0.88
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "click through the checkout flow in the browser"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "click through the checkout flow in the browser"
     }
    }
   ],
   "result": {
    "needs_skill": 0.2,
    "skills": [],
    "status": "ok"
   },
   "turn": "click through the checkout flow in the browser",
   "values": {
    "needs_skill": 0.2,
    "s0": 0.88
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "click through the checkout flow in the browser"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "click through the checkout flow in the browser"
     }
    }
   ],
   "result": {
    "needs_skill": 0.9,
    "skills": [],
    "status": "ok"
   },
   "turn": "click through the checkout flow in the browser",
   "values": {
    "needs_skill": 0.9,
    "s0": 0.3
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "click through the checkout flow in the browser"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "click through the checkout flow in the browser"
     }
    }
   ],
   "result": {
    "needs_skill": 0.05,
    "skills": [],
    "status": "ok"
   },
   "turn": "click through the checkout flow in the browser",
   "values": {}
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "what day is it today"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "what day is it today"
     }
    }
   ],
   "result": {
    "needs_skill": 0.9,
    "skills": [
     {
      "match": 0.88,
      "name": "jev-browser-use",
      "path": "/home/victor/github/jev-skills/skills/jev-browser-use/SKILL.md"
     }
    ],
    "status": "ok"
   },
   "turn": "what day is it today",
   "values": {
    "needs_skill": 0.9,
    "s0": 0.88
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "what day is it today"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "what day is it today"
     }
    }
   ],
   "result": {
    "needs_skill": 0.2,
    "skills": [],
    "status": "ok"
   },
   "turn": "what day is it today",
   "values": {
    "needs_skill": 0.2,
    "s0": 0.88
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "what day is it today"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "what day is it today"
     }
    }
   ],
   "result": {
    "needs_skill": 0.9,
    "skills": [],
    "status": "ok"
   },
   "turn": "what day is it today",
   "values": {
    "needs_skill": 0.9,
    "s0": 0.3
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "what day is it today"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "what day is it today"
     }
    }
   ],
   "result": {
    "needs_skill": 0.05,
    "skills": [],
    "status": "ok"
   },
   "turn": "what day is it today",
   "values": {}
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "rename the column in the changelog table"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "rename the column in the changelog table"
     }
    }
   ],
   "result": {
    "needs_skill": 0.9,
    "skills": [
     {
      "match": 0.88,
      "name": "jev-browser-use",
      "path": "/home/victor/github/jev-skills/skills/jev-browser-use/SKILL.md"
     }
    ],
    "status": "ok"
   },
   "turn": "rename the column in the changelog table",
   "values": {
    "needs_skill": 0.9,
    "s0": 0.88
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "rename the column in the changelog table"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "rename the column in the changelog table"
     }
    }
   ],
   "result": {
    "needs_skill": 0.2,
    "skills": [],
    "status": "ok"
   },
   "turn": "rename the column in the changelog table",
   "values": {
    "needs_skill": 0.2,
    "s0": 0.88
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "rename the column in the changelog table"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "rename the column in the changelog table"
     }
    }
   ],
   "result": {
    "needs_skill": 0.9,
    "skills": [],
    "status": "ok"
   },
   "turn": "rename the column in the changelog table",
   "values": {
    "needs_skill": 0.9,
    "s0": 0.3
   }
  },
  {
   "requests": [
    {
     "model": "jev-latest",
     "questions": {
      "pick:0": {
       "criteria": {
        "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget.",
        "S1": "jev-compaction: Use when a transcript has to be cut to a fixed size and you must choose which turns go. Jev marks each turn keep, summarize or drop. Measured: it does not make a handoff better.",
        "S10": "jev-social-research: Use when researching social posts, creators, reactions, or trends. Jev ranks discovery cards and decides when opened, source-linked evidence is enough for a bounded report.",
        "S2": "jev-computer-use: Use when driving a desktop GUI through a computer-use driver — windows, menus, native apps, OS dialogs. You build a table of safe actions; Jev picks the next one in about 0.4 seconds.",
        "S3": "jev-frontier-work: Use when a task is already judged hard — pick which paid frontier seat takes it, then keep Jev watching the delegated run so it interrupts you only when the run needs a decision.",
        "S4": "jev-mailbox: Use on a mailbox export to sort mail into needs reply, updates, promotional, sales and spam — which messages are addressed to the person at all. For a support queue use jev triage.",
        "S5": "jev-memory: Use on passages a search just returned (memory, vault, session history, wiki, web) before reading them in. Jev ranks them, drops the irrelevant, and flags prompt injection hidden in the text.",
        "S6": "jev-model-routing: Use to pick the cheapest good-enough model or effort for a turn or a delegated task (lanes small to escalate), to decide continue/retry/verify/escalate/complete after each cycle, or to tune routing.",
        "S7": "jev-search: Use after any web or API search, before opening results or spending another round. Jev picks which results to read, whether the evidence is enough, and which query to run next from ones you wrote.",
        "S8": "jev-setup: Use when Jev or your own decision backend is not connected or fails (no_key, auth_failed, backend_misconfigured), or the person asks to set one up. Gets the key stored, unseen by you.",
        "S9": "jev-skill-select: Use when unsure which of many installed skills applies to a request, if any, or when asked to make skill loading cheaper or more accurate. Jev ranks the whole catalog and may say no skill is needed.",
        "none": "No listed skill is a specialised procedure for this turn"
       },
       "instructions": "Which skill is the specialised procedure this turn calls for?",
       "type": "choice"
      }
     },
     "state": {
      "turn": "rename the column in the changelog table"
     }
    },
    {
     "model": "jev-latest",
     "questions": {
      "needs_skill": {
       "instructions": "Doing this turn well requires the specialised instructions of one of these skills",
       "type": "noul"
      },
      "s0": {
       "instructions": "Skill S0 is the right specialised procedure for this turn",
       "type": "noul"
      }
     },
     "state": {
      "skills": {
       "S0": "jev-browser-use: Use when driving a web page in a browser — clicking, typing, navigating, logged-in or JS-rendered pages. Jev picks each step from the elements observed, under a host allowlist and a step budget."
      },
      "turn": "rename the column in the changelog table"
     }
    }
   ],
   "result": {
    "needs_skill": 0.05,
    "skills": [],
    "status": "ok"
   },
   "turn": "rename the column in the changelog table",
   "values": {}
  }
 ]
}
