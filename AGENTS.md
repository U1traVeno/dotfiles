# AGENTS.md

This repository manages Home Manager configurations for multiple users on the
Fedora ThinkPad homelab. Treat it as configuration that affects real user home
directories, not as a disposable package list.

## Repository structure

- `flake.nix` exports Home Manager configurations as `<user>@<host>`.
- `hosts/thinkpad-veno.nix` composes the environment for `/home/veno`.
- `hosts/thinkpad-hermes.nix` currently composes the environment for the
  `/home/hermes` account on this ThinkPad.
- `modules/packages/` contains reusable package groups.
- `modules/shell/` contains interactive shell configuration.
- `packages/` contains packages maintained by this repository.

Keep user-specific composition in `hosts/`. Add or change a shared module only
when the behavior should apply to every host that imports it. Do not make an
Agent account configuration import `thinkpad-veno.nix`.

Hermes Agent accounts are not required to use the literal username `hermes`.
The normal convention is `hermes-<scope>`, such as `hermes-fp` for the Flow Plan
organization. Treat every such account as a separate identity with its own
home directory, Home Manager output, credentials, and package-manager state.
Never assume that one Hermes account may reuse another Hermes account's files
or credentials.

## General operating rules

1. Inspect `git status`, the relevant host, and every imported module before
   editing. The worktree may contain intentional uncommitted changes.
2. Preserve unrelated changes. Never reset, restore, clean, or delete user work
   unless explicitly asked.
3. Prefer the smallest existing module that matches the dependency. Do not add
   a new abstraction for one package without a concrete reuse case.
4. Never put credentials, access tokens, SSH private keys, machine-local secrets,
   or generated authentication state in this repository.
5. Do not add packages merely because they may be useful later. Host imports are
   capability grants and should remain reviewable.
6. Do not run `sudo`, alter Fedora system configuration, or change another
   user's file ownership as part of a Home Manager change.
7. Before applying a configuration, show and validate the proposed diff.

## Package ownership policy

Use Nix/Home Manager for stable runtimes and general command-line tools. Use the
upstream package manager when it is the primary distribution channel and the
tool updates frequently.

In particular, `modules/packages/node.nix` provides Node.js and a user-owned npm
prefix at `$HOME/.local/share/npm`. Install and update `lark-cli` and Codex with
npm under the target user's account; do not reintroduce repository-maintained
Nix derivations for them unless the maintainer explicitly changes this policy.

Do not run npm installation as root. Do not share npm configuration or global
packages between `veno` and any `hermes` or `hermes-<scope>` account, or between
two Agent accounts.

## Mode 1: An Agent manages its own HOME

When an Agent is managing its own environment, first determine the actual Unix
username with `id -un`, then identify the matching `<user>@<host>` output in
`flake.nix`. The account may be named `hermes`, `hermes-fp`, or another
`hermes-<scope>` value. Do not infer the target from the Agent product name.

- Work only in repositories and paths readable or writable by the current
  Agent account.
- Confirm that `home.username` and `home.homeDirectory` match `id -un` and
  `$HOME` before building.
- Use `home-manager build --flake '.#<user>@<host>'` before activation.
- Inspect the build result and report material package, PATH, or file changes.
- Use `home-manager switch --flake '.#<user>@<host>'` only for the current
  Agent account's own home and only after a successful build.
- Do not modify `/home/veno`, copy Veno's configuration state, reuse Veno's
  credentials, or seek elevated permissions.
- Do not read or modify another `hermes-<scope>` account's home, configuration
  state, npm prefix, or credentials.
- Changes intended for the upstream dotfiles repository should be made on a
  topic branch and submitted as a pull request. Agent accounts must not push
  directly to the upstream default branch.

If a new file is untracked, remember that a Git-backed flake reference may omit
it. For pre-commit validation, use an explicit path flake URL when necessary,
for example:

```bash
nix --extra-experimental-features 'nix-command flakes' \
  eval "path:$HOME/dotfiles#homeConfigurations.\"<user>@<host>\".activationPackage.drvPath" \
  --raw
```

For the current ThinkPad deployment, the concrete output is
`hermes@thinkpad`. A future `hermes-fp` account must receive its own host module
and output, for example `hermes-fp@thinkpad`; it must not apply
`hermes@thinkpad` and then patch the generated home by hand.

## Mode 2: Helping a user manage that user's HOME

When helping `veno` or another user, the agent is a configuration author and
reviewer, not that user's runtime identity.

- Confirm the target `<user>@<host>` before editing.
- Read only the repository files needed for the requested change. Do not inspect
  the user's unrelated home files, browser data, SSH directory, credential
  stores, or application state.
- Edit the target host or shared modules only within the user's stated scope.
- Build or evaluate the target configuration when permissions allow, but do not
  activate it as a different user.
- Never use `sudo -u`, `su`, copied credentials, SSH agent forwarding, or changed
  ownership to impersonate the target user.
- Provide the exact `home-manager switch --flake '.#<user>@<host>'` command for
  the target user to run. Execute it only when the user explicitly requests
  activation and the process is already running as that user.
- Treat changes to shared modules as affecting every importing host. Validate
  all affected configurations or clearly state which ones were not validated.

## Validation

For a narrow host change, at minimum evaluate or build the affected Home Manager
configuration. For shared module or flake changes, validate every affected host.
Do not claim success when evaluation was skipped because the Nix daemon, network,
or required credentials were unavailable; report the limitation explicitly.

Do not commit, push, open a pull request, or activate a configuration unless the
user requested that external or runtime action.
