# dotfiles

Home Manager configuration for U1traVeno's development environments.

`veno@headless` is the shared home for every headless x86_64 Linux machine: the
Fedora ThinkPad and the RHEL 9 VM use the same configuration.

```bash
home-manager switch --flake '.#veno@headless'
```

## Bootstrap a fresh Linux

A new headless machine (tested target: RHEL 9, x86_64) needs these steps, in
this order. Only the first needs root, and none of it is done by Home Manager
itself because Nix has to exist first.

1. Install Nix in multi-user mode (creates `/nix`, so it needs sudo once):

   ```bash
   sh <(curl --proto '=https' --tlsv1.2 -fsSL https://nixos.org/nix/install) --daemon
   ```

2. Enable flakes for your user, then open a new shell:

   ```bash
   mkdir -p ~/.config/nix
   echo 'experimental-features = nix-command flakes' >> ~/.config/nix/nix.conf
   ```

3. Clone to `~/dotfiles` (`pi-sync` and the Pi module assume this path; the
   repository is public, so HTTPS needs no credentials):

   ```bash
   git clone https://github.com/U1traVeno/dotfiles.git ~/dotfiles
   ```

4. First activation. `-b bak` renames an existing `~/.bashrc` and friends
   instead of aborting. Keep your current SSH session open until a second one
   logs in correctly:

   ```bash
   nix run github:nix-community/home-manager -- switch --flake ~/dotfiles#veno@headless -b bak
   ```

Afterwards, interactive bash sessions hand over to the Nix-installed zsh
without `chsh` (see `modules/shell/bash.nix`). If zsh ever breaks, get a plain
shell with `ssh -t host 'NO_EXEC_ZSH=1 bash -l'`.

`loginctl enable-linger` is only needed for systemd user services that must
run while logged out (`frpc`); skip it otherwise.

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
