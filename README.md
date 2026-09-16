<div align="center">

# claude-sandbox

**Run Claude Code in isolated Docker Sandboxes (`sbx`) with your host config shared automatically.**

One command. Any project. Your existing settings, skills, plugins and agents — no setup wizard, no re-login.

[![npm version](https://img.shields.io/npm/v/claude-sandbox.svg)](https://www.npmjs.com/package/claude-sandbox)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-windows%20%7C%20macos%20%7C%20linux-lightgrey.svg)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)]()

</div>

---

## Quick Start

```bash
# Install the sbx CLI (macOS shown; see Setup for Windows/Linux)
brew trust docker/tap && brew install docker/tap/sbx

# Install claude-sandbox
npm install -g claude-sandbox

# Open any project and run
cd your-project
claude-sandbox
```

That's it. Claude opens in a sandboxed microVM with your settings, plugins, skills and agents. Log in once (`/login` inside Claude) and `sbx` remembers it for every sandbox.

---

## Why claude-sandbox?

Docker Sandboxes (`sbx`) already gives you a microVM per project and keeps your Anthropic token out of the VM. What it deliberately does **not** do is pick up your user-level Claude config:

- **Blank-slate config** — `~/.claude` (settings, permissions, plugins, agents, commands, `CLAUDE.md`) is not shared. Every sandbox is a fresh install.
- **First-time setup wizard** — Without `~/.claude.json` each sandbox shows the theme picker and onboarding flow.
- **Manual naming and resuming** — You have to remember `sbx run --name …` per project.

`claude-sandbox` layers the missing ergonomics on top of `sbx`: one command, your config, auto-resume.

---

## Features

| Feature | Description |
|---------|-------------|
| **Config sharing** | Host `~/.claude` mounted read-only; settings, plugins, agents, commands, `CLAUDE.md` linked into the sandbox. |
| **Skills** | Host `~/.claude/skills` linked if present, otherwise sbx's shared skills store is used. |
| **No setup wizard** | `~/.claude.json` copied in so Claude starts with your theme and onboarding done. |
| **Zero re-auth** | `sbx` stores your Anthropic OAuth token (or API key) on the host and injects it via its proxy. Log in once, use everywhere. |
| **Any directory** | Point it at any project folder. Sandbox is named by directory and reused automatically. |
| **Auto-resume** | Run `claude-sandbox` again in the same directory and it re-attaches with `--continue`. |
| **Writable workspace** | The project is mounted read-write at the same absolute path as on the host. |
| **Smart prerequisites** | Missing `sbx`? Platform-specific install guide shown automatically. |
| **No dependencies** | Pure Node.js. Zero npm dependencies. No Docker Desktop required. |

---

## Commands

### Running sandboxes

```bash
claude-sandbox                              # current directory, interactive
claude-sandbox /path/to/project             # any project directory
claude-sandbox . -p "analyze this codebase" # with a prompt (print mode)
claude-sandbox -n my-custom-name            # custom sandbox name
claude-sandbox --no-config                  # don't share host ~/.claude
```

### Managing sandboxes

```bash
claude-sandbox list                         # list all sandboxes (sbx ls)
claude-sandbox resume claude-sandbox-myapp  # resume a specific sandbox
claude-sandbox stop claude-sandbox-myapp    # stop a sandbox
claude-sandbox rm claude-sandbox-myapp      # remove a sandbox permanently
```

### Diagnostics

```bash
claude-sandbox status                       # check sbx, daemon, auth, host config
claude-sandbox --help                       # full usage info
```

---

## Output Examples

### First run

```
$ cd my-api
$ claude-sandbox

[claude-sandbox] Project:  /Users/you/Projects/my-api
[claude-sandbox] Sandbox:  claude-sandbox-my-api

[claude-sandbox] [1/4] Creating sandbox microVM...
── CREATE SANDBOX
   ✓ Created sandbox claude-sandbox-my-api
[claude-sandbox] [1/4] Sandbox created.
[claude-sandbox] [2/4] Linking settings, plugins, skills, agents...
[claude-sandbox] [2/4] Linked: settings.json, plugins, agents + ~/.claude.json
[claude-sandbox] [3/4] Verifying sandbox state...
[claude-sandbox] [3/4] All checks passed: claude.json, settings, writable dirs, claude CLI.
[claude-sandbox] [4/4] Launching Claude...
```

### Second run (auto-resume)

```
$ claude-sandbox

[claude-sandbox] Project:  /Users/you/Projects/my-api
[claude-sandbox] Sandbox:  claude-sandbox-my-api
[claude-sandbox] Sandbox exists (stopped). Resuming...
```

### Status check

```
$ claude-sandbox status

Prerequisite Check

  ✓ Docker Sandboxes (sbx) (v0.43.0)
  ✓ sandboxd daemon
  ✓ Anthropic auth (sbx secret) (oauth configured)
  ✓ Claude Code CLI (host)

All prerequisites met. Ready to go.

  Claude home:     /Users/you/.claude
  Host skills:     none (sbx skills store used)
```

---

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│  Your Host Machine                                           │
│                                                              │
│  ~/.claude/                     /path/to/project             │
│  ├── settings.json ───────┐        │                         │
│  ├── plugins/ ────────────┤        │   sbx proxy             │
│  ├── agents/ ─────────────┤        │   (Anthropic token      │
│  ├── commands/ ───────────┤        │    stays on the host)   │
│  └── CLAUDE.md ───────────┤        │        ▲                │
│  ~/.claude.json ──(copy)──┤        │        │                │
│                           │        │        │                │
│  ┌────────────────────────┼────────┼────────┼──────────────┐ │
│  │  Docker Sandbox (microVM)       ▼        │              │ │
│  │                        ▼  /path/to/project (rw)         │ │
│  │  /home/agent/.claude/                                   │ │
│  │  ├── settings.json ──→ symlink to host mount (ro)       │ │
│  │  ├── plugins/ ───────→ symlink to host mount (ro)       │ │
│  │  ├── skills/ ────────→ sbx skills store, or host (ro)   │ │
│  │  ├── sessions/ ──────→ writable (sandbox-local)         │ │
│  │  └── history.jsonl ──→ writable (sandbox-local)         │ │
│  │  /home/agent/.claude.json (copied from host)            │ │
│  │                                                         │ │
│  │  claude --dangerously-skip-permissions                  │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

1. `sbx create --name claude-sandbox-<dir> claude <project> ~/.claude:ro`
2. Inside the sandbox, selected items from the read-only `~/.claude` mount are symlinked into the sandbox's own writable `~/.claude`, and `~/.claude.json` is copied in.
3. `sbx run --name claude-sandbox-<dir> -- --dangerously-skip-permissions`

**Read-only from host** (symlinked): settings, plugins, agents, commands, CLAUDE.md, skills (if present)

**Writable in sandbox** (local): sessions, history, session-env, cache, backups, file-history, tasks, projects

**Project directory**: mounted read-write at the same absolute path as on the host

---

## Configuration

Configuration is automatic. `claude-sandbox` detects your existing Claude Code setup and shares it.

| Item | Source | Access | Notes |
|------|--------|--------|-------|
| Settings | `~/.claude/settings.json` | Read-only | Permissions, deny rules, hooks |
| Plugins | `~/.claude/plugins/` | Read-only | Installed plugins |
| Agents | `~/.claude/agents/` | Read-only | Custom agents |
| Commands | `~/.claude/commands/` | Read-only | Custom slash commands |
| Skills | `~/.claude/skills/` | Read-only | Linked if present; otherwise sbx's `sbx skills` store is mounted |
| CLAUDE.md | `~/.claude/CLAUDE.md` | Read-only | Global instructions |
| Startup config | `~/.claude.json` | Copied | Prevents first-time setup wizard |
| Credentials | `sbx secret` store | Host-side proxy | Never enters the VM. See Authentication. |

Pass `--no-config` to skip all of the above and start from a clean Claude config.

---

## Authentication

`sbx` owns authentication. Your Anthropic token is stored on the host and injected by the sbx proxy into requests to `api.anthropic.com`; it never enters the sandbox filesystem. Two ways to set it up, both one-time:

```bash
# Option A: Claude subscription (Max/Pro) — run /login inside Claude once.
#           sbx captures the OAuth flow and stores it globally.
claude-sandbox
> /login

# Option B: API key
sbx secret set anthropic
```

`claude-sandbox status` shows whether an Anthropic secret is configured (`sbx secret ls`).

> Older versions of this tool symlinked `~/.claude/.credentials.json` into the sandbox. That is no longer done: sbx handles it more safely, and on macOS the token lives in the Keychain, not in a file.

---

## Network & Security

### What's isolated

- **Filesystem** — Sandbox cannot access host files outside the mounted project directory and the read-only `~/.claude`.
- **Credentials** — Anthropic token stays on the host; the sandbox only sees a proxy-managed placeholder.
- **Destructive commands** — `rm -rf /` only affects the sandbox. Host is untouched.
- **Disposable** — `claude-sandbox rm` wipes everything clean.

### What's accessible

- **Internet** — Via the sbx egress proxy (required for the Anthropic API, package registries, etc.). Network policies can be set with `sbx policy`.
- **Project files** — Read-write access to the mounted project directory.

---

## Setup & Prerequisites

`claude-sandbox` checks prerequisites on every run. If something is missing, it shows platform-specific install instructions automatically.

### Requirements

| Requirement | Required? | Notes |
|-------------|-----------|-------|
| Node.js >= 18 | Yes | For the CLI (`npm install -g claude-sandbox`) |
| Docker Sandboxes CLI (`sbx`) | Yes | Standalone binary. **Docker Desktop / Docker Engine are not required.** |
| Claude Code CLI on host | No | Only needed so there is a `~/.claude` to share |

### 1. Install the sbx CLI

Full guide: https://docs.docker.com/ai/sandboxes/install/

```bash
# macOS (Sonoma 14+, Apple silicon)
brew trust docker/tap
brew install docker/tap/sbx

# Windows 11 (enable Hypervisor Platform first, in an admin PowerShell, then reboot)
Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All
winget install -h Docker.sbx

# Linux (Ubuntu 24.04+, KVM enabled, user in the kvm group)
curl -fsSL https://get.docker.com | sudo REPO_ONLY=1 sh
sudo apt install docker-sbx
```

Verify: `sbx version` prints a version and `sbx diagnose` is all green.

### 2. (Optional) Install Claude Code on the host

```bash
npm install -g @anthropic-ai/claude-code
claude   # creates ~/.claude and ~/.claude.json
```

Without this, sandboxes still work; they just start with a default Claude config.

### 3. Install claude-sandbox

```bash
npm install -g claude-sandbox
claude-sandbox status
```

### 4. Run it

```bash
cd your-project
claude-sandbox
```

On the very first sandbox, run `/login` inside Claude (or `sbx secret set anthropic` beforehand). sbx keeps that credential for all future sandboxes.

### Troubleshooting

**`sbx` command not found**
- Install it as above. If you previously used the `docker sandbox` plugin: `sbx` replaces it and does not need Docker.

**"sandboxd daemon" reported stopped**
- Run `sbx daemon start`, or `sbx diagnose` for details.

**Claude asks for browser login inside the sandbox**
- Expected on the first sandbox ever. Complete `/login` once; sbx stores it. Check with `sbx secret ls`.

**Sandbox is slow to create the first time**
- First run pulls the `docker/sandbox-templates:claude-code-docker` image. Subsequent runs reuse it.

**Host skills not showing up**
- If `~/.claude/skills` exists, it is linked in place of the sbx skills store at creation time. Existing sandboxes keep whatever they were created with; `claude-sandbox rm` and re-run to change it. Alternatively use `sbx skills import` to put host skills into the shared store.

### Platform support

| Platform | sbx install |
|----------|-------------|
| macOS | `brew install docker/tap/sbx` (Sonoma 14+, Apple silicon) |
| Windows | `winget install -h Docker.sbx` (Windows 11, Hypervisor Platform) |
| Linux | `apt install docker-sbx` (Ubuntu 24.04+, KVM) |

---

## FAQ

**Q: Does this use my Claude subscription?**
Yes, once you `/login` inside a sandbox sbx stores the OAuth token on the host and reuses it for every sandbox.

**Q: Can the sandbox modify my host files?**
Only files inside the mounted project directory. Your `~/.claude` is mounted read-only. Everything else is inaccessible.

**Q: What happens when I close the terminal?**
The sandbox stops but persists. Run `claude-sandbox` again in the same directory and it auto-resumes.

**Q: Can I run multiple sandboxes?**
Yes. Each project directory gets its own sandbox (`claude-sandbox-<dirname>`).

**Q: Why `--dangerously-skip-permissions`?**
Inside the sandbox the VM is the permission boundary. `sbx run claude` uses this flag by default; we pass it explicitly.

**Q: Does this make network calls?**
The `claude-sandbox` CLI itself makes zero network calls. It only runs local `sbx` commands and reads local files.

**Q: I used an older version with `docker sandbox`. What changed?**
Docker renamed the sandbox plugin to a standalone `sbx` CLI. Commands map 1:1 (`sbx create`, `sbx run --name`, `sbx ls`, `sbx rm --force`), credentials are handled by sbx instead of a mounted `.credentials.json`, and Docker Desktop is no longer needed. `--no-auth` still works as an alias for `--no-config`.

---

## Contributing

```bash
git clone https://github.com/callobuzz/claude-sandbox.git
cd claude-sandbox
npm test               # unit tests (node --test)
npm link               # install globally for development
claude-sandbox status  # verify it works against your sbx install
```

---

## About

Built by [Call O Buzz Services](https://callobuzz.com) — AI-driven software development, SaaS solutions, and open source tools.

---

## License

MIT
