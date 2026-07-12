{ config, pkgs, ... }:
{
  programs.zsh = {
    enable = true;
    autocd = true;
    # Zim's completion module owns compinit; running Home Manager's setup too
    # initializes completion twice.
    enableCompletion = false;
    history = {
      expireDuplicatesFirst = true;
      ignoreAllDups = true;
      save = 100000;
      size = 100000;
    };

    shellAliases = {
      lg = "lazygit";
      t = "tmux";
    };

    initContent = ''
      if [[ -r "${config.xdg.cacheHome}/p10k-instant-prompt-''${(%):-%n}.zsh" ]]; then
        source "${config.xdg.cacheHome}/p10k-instant-prompt-''${(%):-%n}.zsh"
      fi

      bindkey -v
      WORDCHARS=''${WORDCHARS//[\/]}
      export ZIM_HOME="''${ZDOTDIR:-$HOME}/.zim"

      if [[ ! "$ZIM_HOME/init.zsh" -nt "''${ZIM_CONFIG_FILE:-$HOME/.zimrc}" ]]; then
        source ${pkgs.zimfw}/zimfw.zsh init
      fi
      source "$ZIM_HOME/init.zsh"

      zmodload -F zsh/terminfo +p:terminfo
      for key ('^[[A' '^P' ''${terminfo[kcuu1]}) bindkey "$key" history-substring-search-up
      for key ('^[[B' '^N' ''${terminfo[kcud1]}) bindkey "$key" history-substring-search-down
      bindkey -M vicmd k history-substring-search-up
      bindkey -M vicmd j history-substring-search-down

      function y() {
        local tmp="$(mktemp -t 'yazi-cwd.XXXXXX')" cwd
        command yazi "$@" --cwd-file="$tmp"
        IFS= read -r -d ''' cwd < "$tmp"
        [[ -n "$cwd" && "$cwd" != "$PWD" ]] && builtin cd -- "$cwd"
        rm -f -- "$tmp"
      }

      [[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
    '';
  };

  home.file = {
    ".zimrc".source = ../../config/zimrc;
    ".p10k.zsh".source = ../../config/p10k.zsh;
  };
}
