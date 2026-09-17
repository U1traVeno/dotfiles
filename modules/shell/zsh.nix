{ config, lib, pkgs, ... }:
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

    # The two halves of this option are ordered deliberately. Powerlevel10k's
    # instant prompt prints the prompt before the rest of ~/.zshrc has run and
    # then redirects stdout and stderr into a scratch file for the remainder of
    # initialization, so that nothing can scribble over a prompt that is already
    # on screen. Whatever lands in that scratch file is replayed underneath the
    # prompt afterwards, which pushes the prompt down and earns this warning
    # from Powerlevel10k:
    #
    #   Console output during zsh initialization detected.
    #
    # Order 500 is therefore the earliest point in this configuration where
    # printing is allowed. modules/shell/direnv.nix deliberately places the
    # starting directory's `direnv export` just above it, at 490, which is what
    # upstream prescribes for using direnv with instant prompt:
    #
    #   https://github.com/romkatv/powerlevel10k#how-do-i-initialize-direnv-when-using-instant-prompt
    initContent = lib.mkMerge [
      (lib.mkOrder 500 ''
        if [[ -r "${config.xdg.cacheHome}/p10k-instant-prompt-''${(%):-%n}.zsh" ]]; then
          source "${config.xdg.cacheHome}/p10k-instant-prompt-''${(%):-%n}.zsh"
        fi
      '')

      ''
        bindkey -v
        WORDCHARS=''${WORDCHARS//[\/]}
        export ZIM_HOME="''${ZDOTDIR:-$HOME}/.zim"

        # config/zimrc loads zsh-autosuggestions last, so it does not have to
        # re-bind its widgets on every prompt.
        ZSH_AUTOSUGGEST_MANUAL_REBIND=1

        # ~/.zimrc is a symlink into the nix store and store paths are stamped
        # with mtime 1, so once ~/.zim/init.zsh exists this check stays false and
        # a changed config/zimrc does not regenerate it. After changing that
        # file, run `zimfw init` (or delete ~/.zim/init.zsh) once.
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

        # Veno's personal wrappers. Kept as a shell file rather than a Nix
        # string because the escaping required for this much shell is a
        # maintenance hazard.
        source "${config.home.homeDirectory}/.config/zsh/veno.zsh"
      ''
    ];
  };

  home.file = {
    ".zimrc".source = ../../config/zimrc;
    ".p10k.zsh".source = ../../config/p10k.zsh;
    ".config/zsh/veno.zsh".source = ../../config/zsh/veno.zsh;
  };
}
