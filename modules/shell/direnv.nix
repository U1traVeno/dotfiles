{ ... }:
# Per-directory development environments: entering a directory with an .envrc
# loads its flake devShell, leaving it unloads.
#
# The shell hook is not installed by this module directly. Home Manager writes
# it into programs.zsh.initContent, which only reaches ~/.zshrc on hosts that
# also import ../shell/zsh.nix. On a host whose shell is still hand-maintained
# the hook has to be sourced manually, otherwise direnv is installed but inert.
{
  programs.direnv = {
    enable = true;

    # Without this, `use flake` re-evaluates the flake on every cd, and
    # nix-collect-garbage is free to delete the devShell closure. nix-direnv
    # caches the evaluation and registers a GC root per project.
    nix-direnv.enable = true;
  };
}
