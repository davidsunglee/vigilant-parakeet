# Agentic OrbStack Apple baseline

Local Apple Silicon / OrbStack dev container for TypeScript, Python, and terminal agent development.

## Included

- Ubuntu 24.04
- `coder` user with passwordless `sudo`
- `zsh`, `zoxide`, `fzf`, `eza`, `bat`, `fd`, `ripgrep`, `tree`
- `nvim`, `tmux`
- Node.js 24, `pnpm`, `bun`
- Python 3.12, `uv`
- `git`, `gh`, `delta`, `jq`
- `pi`, `claude`, `codex`, `opencode`

Agent CLIs install into `/home/coder/.local` so they can self-update without `sudo`.

## Use in a repo

Copy these files into the repo's `.devcontainer/` directory:

```sh
mkdir -p /path/to/repo/.devcontainer
cp -R devcontainers/orbstack-apple-agentic/. /path/to/repo/.devcontainer/
```

## Auth

This template uses shared named volumes for local agent state. Log in once inside a container, and other repos using this template can reuse the same container-side state.

Host macOS config is not bind-mounted by default. Claude Code uses `CLAUDE_CONFIG_DIR=/home/coder/.claude`, with `~/.claude.json` symlinked into that persisted directory for compatibility.

## Xcode

Xcode cannot run inside this Linux container. Keep Xcode, simulators, signing, and `xcodebuild` on the macOS host. Use this container for agent CLIs and Linux development tooling.
