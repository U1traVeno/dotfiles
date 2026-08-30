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
      l = "ls -lha";
      hm = "home-manager";
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

      sm-add() {
        if (( $# < 2 )); then
          print -u2 'usage: sm-add PROFILE SOURCE [SKILLS-ADD-OPTION...]'
          return 2
        fi

        local profile=$1 arg tmp
        shift
        for arg in "$@"; do
          case $arg in
            -g|--global|--global=*|-a|--agent|--agent=*|--all|--copy)
              print -u2 "sm-add: unsupported skills add option: $arg"
              return 2
              ;;
          esac
        done

        tmp=$(mktemp -d "''${TMPDIR:-/tmp}/sm-add.XXXXXXXX") || return 1
        {
          (
            cd "$tmp" &&
              command npx --yes skills add "$@" --agent universal --yes
          ) || return
          command sm import \
            --profile "$profile" \
            --from "$tmp/.agents/skills" \
            --replace || return
          if ! command sm apply; then
            print -u2 "sm-add: imported into profile $profile, but sm apply failed"
            return 1
          fi
        } always {
          command rm -rf -- "$tmp"
        }
      }

      # `dsh` boots its HMR plugin in-process, which needs Node's internal
      # module loader — only reachable under `--expose-internals`. The
      # upstream native fallback (node-addon-require-builtin) has no prebuilt
      # for Node 24, and `--expose-internals` is rejected in NODE_OPTIONS,
      # so re-launch the npm-installed bin under `node --expose-internals`.
      dsh() {
        local bin="''${commands[dsh]:-$HOME/.local/share/npm/bin/dsh}"
        node --expose-internals "$bin" "$@"
      }

      [[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
    '';
  };

  home.file = {
    ".zimrc".source = ../../config/zimrc;
    ".p10k.zsh".source = ../../config/p10k.zsh;
  };
}
