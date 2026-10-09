import { test, expect } from 'claude-code/testing'
import { bashHits, concerns, hitsOf, hostMatches, hostOf, isLocal, judge, mcpCategory, refusal, type Category } from './rules'

// The access gate's reading of a call, with no IO: which categories a command falls under, the
// hosts it names, and what a session's allows let through.

const HOME = '/home/u'
const cats = (command: string) => [...new Set(bashHits(command, HOME).map(h => h.category))].sort()
const hosts = (command: string) => bashHits(command, HOME).flatMap(h => h.hosts)

/** Each fixture: a command, and the categories it falls under ([] for none). */
function expectAll(rows: [string, Category[]][]) {
  for (const [command, want] of rows) {
    const got = cats(command)
    if (JSON.stringify(got) !== JSON.stringify([...want].sort())) throw new Error(`${command}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
  }
}

test('ssh: the clients that log in elsewhere are hits; git over ssh is not', () => {
  expectAll([
    ['ssh vm1', ['ssh']],
    ['ssh -p 2222 victor@vm1.lab.example uptime', ['ssh']],
    ['ssh -i ~/.ssh/id_ed25519 vm1', ['ssh']], // the key used to log in is not a key read out
    ['scp build.tar vm1:/tmp/', ['ssh']],
    ['scp -P 2222 victor@vm1:/var/log/syslog .', ['ssh']],
    ['sftp vm1', ['ssh']],
    ['mosh vm1', ['ssh']],
    ['autossh -M 0 vm1', ['ssh']],
    ['sshpass -p hunter2 ssh vm1', ['ssh']],
    ['ssh-copy-id victor@vm1', ['ssh']],
    ['rsync -av dist/ vm1:/srv/app/', ['ssh']],
    ['rsync -av -e ssh dist/ backup/', ['ssh']],
    ['rsync -av "-e ssh -p 22" dist/ backup/', ['ssh']], // one word, as rsync reads it: -e with its value
    ['sshfs vm1:/srv /mnt/srv', ['ssh']],
    ['tailscale ssh vm1', ['ssh']],
    ['cloudflared access ssh --hostname vm1.example', ['ssh']],
    // not ssh
    ['git push origin main', []],
    ['git pull git@github.com:me/repo.git', []],
    ['GIT_SSH_COMMAND="ssh -i ~/.ssh/deploy" git fetch', []],
    ['git clone ssh://git@github.com/me/repo.git', []],
    ['rsync -av dist/ backup/', []],
    ['scp a.txt b.txt', []],
    ['ssh -V', []],
    ['man ssh', []],
    ['which ssh', []],
    ['command -v ssh', []],
    ['echo "ssh vm1"', []],
    ['grep -r "ssh vm1" docs/', []],
    ['ssh-keygen -t ed25519 -f /tmp/test-key -N ""', []],
  ])
})

test('wrapping: bash -c, sudo, env, timeout, nohup, xargs, eval, pipes and lists', () => {
  expectAll([
    ['bash -c "ssh vm1 uptime"', ['ssh']],
    ["sh -c 'cd /tmp && scp x vm1:'", ['ssh']],
    ['zsh -lc "mosh vm1"', ['ssh']],
    ['sudo ssh root@vm1', ['ssh']],
    ['sudo -u deploy ssh vm1', ['ssh']],
    ['env TERM=xterm ssh vm1', ['ssh']],
    ['timeout 10 ssh vm1 true', ['ssh']],
    ['nohup ssh -N vm1 &', ['ssh']],
    ['echo vm1 | xargs -n1 ssh', []], // the host comes from the pipe: no destination to read
    ['echo vm1 vm2 | xargs -I{} ssh {} uptime', ['ssh']],
    ['eval "ssh vm1"', ['ssh']],
    ['make build && ssh vm1 "systemctl restart app"', ['ssh']],
    ['npm test; ssh vm1', ['ssh']],
    ['false || ssh vm1', ['ssh']],
    ['cat hosts.txt | ssh vm1 "cat > hosts.txt"', ['ssh']],
    ['echo $(ssh vm1 hostname)', ['ssh']],
    ['npm test\nssh vm1', ['ssh']],
    ['/usr/bin/ssh vm1', ['ssh']],
  ])
})

test('remote desktop, cloud shells and fleets', () => {
  expectAll([
    ['xfreerdp /v:win.lab:3389 /u:admin', ['remote-desktop']],
    ['rdesktop win.lab', ['remote-desktop']],
    ['remmina -c rdp://win.lab', ['remote-desktop']],
    ['vncviewer vm1:1', ['remote-desktop']],
    ['xdg-open rdp://win.lab', ['remote-desktop']],
    ['open vnc://mac.lab', ['remote-desktop']],
    ['xdg-open https://example.com', []],
    ['aws ssm start-session --target i-0abc', ['cloud-shell']],
    ['aws --region us-east-1 ec2-instance-connect ssh --instance-id i-0abc', ['cloud-shell']],
    ['aws s3 ls', []],
    ['gcloud compute ssh my-vm --zone us-central1-a', ['cloud-shell']],
    ['gcloud --project p beta compute scp a.txt my-vm:/tmp', ['cloud-shell']],
    ['gcloud cloud-shell ssh', ['cloud-shell']],
    ['gcloud compute instances list', []],
    ['az ssh vm -n my-vm -g rg', ['cloud-shell']],
    ['az vm run-command invoke -g rg -n vm --command-id RunShellScript', ['cloud-shell']],
    ['az vm list', []],
    ['kubectl exec -it web-0 -- sh', ['cloud-shell']],
    ['kubectl -n prod exec web-0 -- ls', ['cloud-shell']],
    ['kubectl port-forward svc/web 8080:80', ['cloud-shell']],
    ['kubectl cp web-0:/tmp/x ./x', ['cloud-shell']],
    ['kubectl debug node/n1 -it --image=busybox', ['cloud-shell']],
    ['kubectl get pods', []],
    ['kubectl logs web-0', []],
    ['oc rsh web-0', ['cloud-shell']],
    ['docker exec -it web sh', []], // the local daemon
    ['docker -H tcp://10.0.0.5:2376 exec web ls', ['cloud-shell']],
    ['docker --host ssh://u@vm1 container exec web ls', ['cloud-shell']],
    ['DOCKER_HOST=tcp://10.0.0.5:2376 docker exec web ls', ['cloud-shell']],
    ['docker --context prod exec web ls', ['cloud-shell']],
    ['docker -H unix:///var/run/docker.sock exec web ls', []],
    ['docker -H tcp://10.0.0.5:2376 ps', []],
    ['virsh console vm1', ['cloud-shell']],
    ['vagrant ssh', ['cloud-shell']],
    ['vagrant up', []],
    ['multipass shell', ['cloud-shell']],
    ['ansible all -m ping', ['fleet']],
    ['ansible-playbook -i inv site.yml', ['fleet']],
    ['ansible-lint site.yml', []],
    ['pssh -h hosts uptime', ['fleet']],
    ['salt "*" test.ping', ['fleet']],
    ['fab deploy', ['fleet']],
    ['pdsh -w vm[1-4] uptime', ['fleet']],
    ['clush -a uptime', ['fleet']],
  ])
})

test('tunnels, remote databases, legacy protocols and scanners', () => {
  expectAll([
    ['ssh -L 5432:db:5432 bastion', ['ssh', 'tunnels']],
    ['ssh -fNL 8080:localhost:80 vm1', ['ssh', 'tunnels']],
    ['ssh -R 9000:localhost:3000 vm1', ['ssh', 'tunnels']],
    ['ssh -D 1080 vm1', ['ssh', 'tunnels']],
    ['ngrok http 3000', ['tunnels']],
    ['cloudflared tunnel --url http://localhost:3000', ['tunnels']],
    ['tailscale funnel 3000', ['tunnels']],
    ['tailscale serve 3000', ['tunnels']],
    ['tailscale up', ['tunnels']],
    ['tailscale status', []],
    ['chisel server --port 9000', ['tunnels']],
    ['frpc -c frpc.toml', ['tunnels']],
    ['socat TCP-LISTEN:8080,fork TCP:localhost:80', ['tunnels']],
    ['socat - TCP:localhost:80', []],
    ['nc -l 9000', ['tunnels']],
    ['nc -lvp 4444', ['tunnels']],
    ['ncat --listen 4444', ['tunnels']],
    ['nc -z localhost 5432', []],
    ['lt --port 3000', ['tunnels']],
    ['bore local 3000 --to bore.pub', ['tunnels']],
    ['psql -h db.prod.example -U app', ['remote-db']],
    ['psql --host=10.0.0.9 app', ['remote-db']],
    ['psql postgres://app@db.prod.example:5432/app', ['remote-db']],
    ['psql "host=db.prod.example dbname=app"', ['remote-db']],
    ['PGHOST=db.prod.example psql app', ['remote-db']],
    ['psql -h localhost app', []],
    ['psql -h 127.0.0.1 -c "select 1"', []],
    ['psql -h /var/run/postgresql app', []],
    ['psql app', []],
    ['psql postgresql://localhost/app', []],
    ['mysql -h db.prod.example -u root', ['remote-db']],
    ['mysql -hdb.prod.example', ['remote-db']],
    ['mysql -u root', []],
    ['mysql -h ::1 -u root', []],
    ['mongosh "mongodb+srv://cluster0.example.net/app"', ['remote-db']],
    ['mongosh mongodb://localhost:27017', []],
    ['redis-cli -h cache.prod.example', ['remote-db']],
    ['redis-cli ping', []],
    ['sqlcmd -S tcp:sql.prod.example,1433 -U sa', ['remote-db']],
    ['sqlcmd -S localhost -U sa', []],
    ['telnet vm1 25', ['legacy']],
    ['ftp files.example', ['legacy']],
    ['lftp sftp://files.example', ['legacy']],
    ['tftp 10.0.0.1', ['legacy']],
    ['rlogin vm1', ['legacy']],
    ['smbclient //nas/share -U me', ['legacy']],
    ['sudo mount -t cifs //nas/share /mnt/nas', ['legacy']],
    ['mount -t nfs nas:/export /mnt/nfs', ['legacy']],
    ['mount /dev/sdb1 /mnt/usb', []],
    ['nmap -sV 10.0.0.0/24', ['scanning']],
    ['masscan -p80 10.0.0.0/8', ['scanning']],
    ['zmap -p 443', ['scanning']],
    ['rustscan -a 10.0.0.1', ['scanning']],
  ])
})

test('keys: private keys and credential stores read or copied, access configs written; public keys and listings are fine', () => {
  expectAll([
    ['cat ~/.ssh/id_ed25519', ['keys']],
    ['cat $HOME/.ssh/id_rsa', ['keys']],
    ['cat /home/u/.ssh/id_ecdsa', ['keys']],
    ['sudo cat /root/.ssh/id_rsa', ['keys']],
    ['cp ~/.ssh/id_rsa /tmp/k', ['keys']],
    ['base64 ~/.ssh/deploy_key', ['keys']],
    ['tar czf keys.tgz ~/.ssh', ['keys']],
    ['grep -r BEGIN ~/.ssh', ['keys']],
    ['cat ~/.ssh/*', ['keys']],
    ['cat ~/.aws/credentials', ['keys']],
    ['cat ~/.kube/config', ['keys']],
    ['cat ~/.docker/config.json', ['keys']],
    ['cat ~/.netrc', ['keys']],
    ['gpg --export-secret-keys me@example.com', ['keys']],
    ['echo "ssh-ed25519 AAAA me" >> ~/.ssh/authorized_keys', ['keys']],
    ['cat key.pub | tee -a ~/.ssh/authorized_keys', ['keys']],
    ['printf "Host vm1\\n" >> ~/.ssh/config', ['keys']],
    ['cp new_config ~/.ssh/config', ['keys']],
    ['sed -i s/a/b/ ~/.ssh/config', ['keys']],
    ['bash -c "cat ~/.ssh/id_ed25519"', ['keys']],
    // fine
    ['cat ~/.ssh/id_ed25519.pub', []],
    ['cat ~/.ssh/known_hosts', []],
    ['cat ~/.ssh/config', []],
    ['cat ~/.ssh/authorized_keys', []],
    ['ls -la ~/.ssh', []],
    ['chmod 600 ~/.ssh/id_ed25519', []],
    ['ssh-add ~/.ssh/id_ed25519', []],
    ['cat ~/.aws/config', []],
    ['gpg --export me@example.com', []],
    ['cat README.md', []],
  ])
  // logging in with a key is ssh, not a key read out
  expect(cats('ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes vm1')).toEqual(['ssh'])
  expect(cats('scp -i ~/.ssh/id_ed25519 a vm1:')).toEqual(['ssh'])
})

test('the file tools: Read of a private key or a credential store, Grep of ~/.ssh, Write/Edit of an access config', () => {
  const cat = (tool: string, input: unknown) => hitsOf(tool, input, HOME).map(h => h.category)
  expect(cat('Read', { file_path: '/home/u/.ssh/id_ed25519' })).toEqual(['keys'])
  expect(cat('Read', { file_path: '~/.ssh/id_rsa' })).toEqual(['keys'])
  expect(cat('Read', { file_path: '/home/u/.ssh/id_ed25519.pub' })).toEqual([])
  expect(cat('Read', { file_path: '/home/u/.ssh/config' })).toEqual([])
  expect(cat('Read', { file_path: '/home/u/.aws/credentials' })).toEqual(['keys'])
  expect(cat('Read', { file_path: '/home/u/proj/src/a.ts' })).toEqual([])
  expect(cat('Grep', { pattern: 'BEGIN', path: '/home/u/.ssh' })).toEqual(['keys'])
  expect(cat('Grep', { pattern: 'x', path: '/home/u/proj' })).toEqual([])
  expect(cat('Write', { file_path: '/home/u/.ssh/authorized_keys', content: 'ssh-ed25519 AAAA' })).toEqual(['keys'])
  expect(cat('Edit', { file_path: '/home/u/.ssh/config', old_string: 'a', new_string: 'b' })).toEqual(['keys'])
  expect(cat('Write', { file_path: '/home/u/.ssh/id_ed25519', content: '-----BEGIN' })).toEqual(['keys'])
  expect(cat('Edit', { file_path: '/home/u/proj/README.md', old_string: 'a', new_string: 'b' })).toEqual([])
})

test('MCP tools by the words in their names', () => {
  expect(mcpCategory('mcp__ssh-server__run_command')).toBe('ssh')
  expect(mcpCategory('mcp__infra__sshExec')).toBe('ssh')
  expect(mcpCategory('mcp__desktop__rdp_connect')).toBe('remote-desktop')
  expect(mcpCategory('mcp__k8s__get_pods')).toBe('cloud-shell')
  expect(mcpCategory('mcp__box__remote_exec')).toBe('cloud-shell')
  expect(mcpCategory('mcp__terminal__run_shell')).toBe('cloud-shell')
  expect(mcpCategory('mcp__github__create_issue')).toBe(null)
  expect(mcpCategory('mcp__jev-mod__find_files')).toBe(null)
  expect(mcpCategory('mcp__notes__execute_query')).toBe(null) // "execute" is not the word "exec"
  expect(hitsOf('mcp__ssh-server__run_command', { host: 'vm1', command: 'ls' })).toEqual([{ category: 'ssh', command: 'mcp__ssh-server__run_command', hosts: ['vm1'] }])
  expect([concerns('Bash'), concerns('Read'), concerns('Glob'), concerns('WebFetch'), concerns('mcp__github__create_issue'), concerns('mcp__ssh__run')])
    .toEqual([true, true, false, false, false, true])
})

test('hosts: read from each client, local ones known, scopes matched', () => {
  expect(hosts('ssh -p 22 victor@VM1.lab:22')).toEqual(['vm1.lab'])
  expect(hosts('ssh -J bastion vm1')).toEqual(['vm1', 'bastion'])
  expect(hosts('scp a vm1:/x b')).toEqual(['vm1'])
  expect(hosts('rsync -a x/ deploy@vm2:/srv/')).toEqual(['vm2'])
  expect(hosts('mosh victor@vm3')).toEqual(['vm3'])
  expect(hosts('psql -h db1 app')).toEqual(['db1'])
  expect(hosts('ssh -l root [fe80::1]')).toEqual(['fe80::1'])
  expect(hosts('ngrok http 80')).toEqual([])
  expect([hostOf('ssh://u@h:2222/x'), hostOf('u@h'), hostOf('[::1]:22'), hostOf('h:5432')]).toEqual(['h', 'h', '::1', 'h'])
  expect([isLocal('localhost'), isLocal('127.0.0.1'), isLocal('127.1.2.3'), isLocal('::1'), isLocal('/tmp/sock'), isLocal('vm1'), isLocal('10.0.0.1')])
    .toEqual([true, true, true, true, true, false, false])
  expect(hostMatches('vm1.lab.example', ['*.lab.example'])).toBe(true)
  expect(hostMatches('VM1', ['vm1'])).toBe(true)
  expect(hostMatches('vm2', ['vm1'])).toBe(false)
  expect(hostMatches('evil.example', ['*.lab.example'])).toBe(false)
})

test('the verdict: blocked by default; a session allow, a host scope, alwaysAllow and localhost let a call through', () => {
  const hits = (command: string) => bashHits(command, HOME)
  const blocked = (command: string, grants = {}, always: Category[] = [], local = true) =>
    judge(hits(command), grants, always, local).blocked.map(h => h.category)
  expect(blocked('ssh vm1')).toEqual(['ssh'])
  expect(blocked('ssh vm1', { ssh: {} })).toEqual([])
  expect(blocked('ssh vm1', {}, ['ssh'])).toEqual([])
  expect(blocked('ssh localhost')).toEqual([])
  expect(blocked('ssh victor@127.0.0.1 ls')).toEqual([])
  expect(blocked('ssh localhost', {}, [], false)).toEqual(['ssh'])
  // a host scope allows only the hosts it names; a host it cannot read is refused
  expect(blocked('ssh vm1', { ssh: { hosts: ['vm1'] } })).toEqual([])
  expect(blocked('ssh vm2', { ssh: { hosts: ['vm1'] } })).toEqual(['ssh'])
  expect(blocked('ssh -J bastion vm1', { ssh: { hosts: ['vm1'] } })).toEqual(['ssh'])
  expect(blocked('rsync -a -e ssh x/ y/', { ssh: { hosts: ['vm1'] } })).toEqual(['ssh'])
  expect(blocked('scp a vm1.lab:/tmp', { ssh: { hosts: ['*.lab'] } })).toEqual([])
  // one allow does not open another category
  expect(blocked('ssh -L 5432:db:5432 vm1', { ssh: {} })).toEqual(['tunnels'])
  expect(blocked('ssh -L 5432:db:5432 vm1', { ssh: {}, tunnels: {} })).toEqual([])
  expect(blocked('cat ~/.ssh/id_rsa', { ssh: {} })).toEqual(['keys'])
  expect(blocked('cat ~/.ssh/id_rsa', { keys: {} })).toEqual([])
})

test('the refusal names the category and the command, and tells the model to ask', () => {
  const said = refusal(bashHits('ssh victor@vm1 uptime', HOME), {})
  expect(said).toContain('This session does not allow ssh: `ssh victor@vm1 uptime`.')
  expect(said).toContain('Ask the person to run it themselves, or to allow ssh for this session with /jev-mod access ssh on.')
  const scoped = refusal(bashHits('ssh vm2', HOME), { ssh: { hosts: ['vm1'] } })
  expect(scoped).toContain('This session does not allow ssh to vm2 (this session allows ssh only to vm1)')
  const two = refusal(bashHits('ssh -L 1:a:1 vm1 && cat ~/.ssh/id_rsa', HOME), {})
  expect(two).toContain('/jev-mod access ssh on and /jev-mod access tunnels on and /jev-mod access keys on')
})
