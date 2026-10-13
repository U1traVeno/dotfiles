# Bash as the bootstrap shell on hosts whose login shell is not zsh.
#
# On a non-NixOS machine the login shell is whatever the distribution gave the
# account (bash on RHEL), and changing it needs an /etc/shells entry and chsh,
# which are system configuration. Instead bash hands over to the zsh that
# modules/shell/zsh.nix installs, from inside the user's own ~/.bashrc.
#
# Hosts whose login shell is already zsh are unaffected: the handoff is skipped
# once $SHELL names zsh.
{ config, lib, ... }:
let
  zsh = lib.getExe config.programs.zsh.package;
in
{
  programs.bash = {
    enable = true;

    # Home Manager emits bashrcExtra above its `[[ $- == *i* ]] || return`
    # line, so this also runs for `ssh host cmd`. Without it a non-interactive
    # command never sees ~/.nix-profile/bin. hm-session-vars.sh guards against
    # being sourced twice, so the login-shell path through ~/.profile is not
    # repeated.
    bashrcExtra = ''
      . "${config.home.sessionVariablesPackage}/etc/profile.d/hm-session-vars.sh"
    '';

    # Interactive shells only (login shells reach here through ~/.bash_profile,
    # and tmux panes start bash non-login). $SHELL is rewritten before the exec:
    # that is the loop guard, since a `bash` typed inside zsh then sees zsh in
    # $SHELL and stays in bash, and tmux/yazi/nvim pick zsh for new shells.
    #
    # Escape hatch if zsh ever breaks:
    #   ssh -t host 'NO_EXEC_ZSH=1 bash -l'
    initExtra = ''
      if [[ -z "''${NO_EXEC_ZSH:-}" && "''${SHELL##*/}" != zsh &&
            -t 0 && "''${TERM:-dumb}" != dumb && -x "${zsh}" ]]; then
        export SHELL="${zsh}"
        if shopt -q login_shell; then exec "${zsh}" -l; else exec "${zsh}"; fi
      fi
    '';
  };
}
