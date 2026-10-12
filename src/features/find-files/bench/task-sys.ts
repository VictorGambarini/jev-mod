// The real RepoSys for find-files' large-project bench (task-repo.ts): processes and folders
// through the bench's own helpers. src/bench/features.ts imports it, so the runner has it; the
// kit's tests do not, since they cannot start processes.

import { fs, run } from '../../../bench/node'
import { installRepoSys } from './task-repo'

installRepoSys({
  run: (cmd, args, o) => run(cmd, args, { ...(o.cwd ? { cwd: o.cwd } : {}), timeoutMs: o.timeoutMs }),
  rm: async path => { await (await fs()).rm(path, { recursive: true, force: true }) },
  mkdir: async path => { await (await fs()).mkdir(path, { recursive: true }) },
})
