{ config, lib, ... }:
# Per-directory development environments: entering a directory with an .envrc
# loads its flake devShell, leaving it unloads.
#
# Home Manager writes the chpwd/precmd hook into programs.zsh.initContent, which
# only reaches ~/.zshrc on hosts that also import ../shell/zsh.nix. A host that
# does not cannot get the hook from this module either, since Home Manager only
# writes ~/.zshrc when programs.zsh.enable is set.
{
  programs.direnv = {
    enable = true;

    # Without this, `use flake` re-evaluates the flake on every cd, and
    # nix-collect-garbage is free to delete the devShell closure. nix-direnv
    # caches the evaluation and registers a GC root per project.
    nix-direnv.enable = true;

    # The default integration order (1000) leaves the hook behind the instant
    # prompt, which is what we want.
  };

  # Load the starting directory's .envrc *before* Powerlevel10k prints its
  # instant prompt, and let the hook above handle every later cd.
  #
  # Instant prompt captures stdout and stderr for the rest of initialization and
  # replays whatever it caught underneath the prompt afterwards. A dev shell
  # loaded on the first precmd therefore lands in that capture: its output —
  # direnv's own log lines and the flake's shellHook — is replayed below a
  # already-drawn prompt, after a "Console output during zsh initialization
  # detected" warning. Running the export up front keeps that output in the
  # window where console I/O is still allowed, which is the arrangement upstream
  # documents for direnv:
  #
  #   https://github.com/romkatv/powerlevel10k#how-do-i-initialize-direnv-when-using-instant-prompt
  #
  # 490 is deliberate and must stay below the instant prompt's 500 in
  # ../shell/zsh.nix.
  programs.zsh.initContent = lib.mkOrder 490 ''
    emulate zsh -c "$(${lib.getExe config.programs.direnv.package} export zsh)"
  '';
}
