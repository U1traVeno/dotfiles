# dotfiles

Home Manager configuration for U1traVeno's development environments.

The first host is Fedora Linux on the ThinkPad homelab:

```bash
home-manager switch --flake '.#veno@thinkpad'
```

## Pi Agent

Pi's shared settings and provider endpoints live under `pi/`. Home Manager links
those manifests into `~/.pi/agent/` without routing them through a read-only Nix
store file, so Pi can continue to manage its package list.

Run the following on either Veno host to pull dotfiles, apply its Home Manager
configuration, and update all unpinned Pi packages:

```bash
pi-sync
```

Credentials, sessions, project trust, and installed npm/git package data remain
machine-local under `~/.pi/agent/` and must not be committed.
