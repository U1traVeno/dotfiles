{ config, lib, pkgs, ... }:
# Incremental migration of /Users/veno on the Apple Silicon MacBook.
#
# Only modules that are known to work on aarch64-darwin and that do not fight
# with the existing hand-maintained dotfiles are imported. Move one concern at a
# time out of Homebrew / hand-written rc files and into this list.
#
# PATH precedence over Homebrew comes from base.nix, which already puts
# $HOME/.nix-profile/bin ahead of $PATH in hm-session-vars.sh.
#
# Deliberately not imported yet:
#   modules/services/frp.nix       - systemd user service, Linux only
#   modules/packages/compilers.nix - gcc is not a usable toolchain on darwin;
#                                    /usr/bin/cc from the Xcode CLT links here
#   modules/packages/node.nix      - Node stays with Homebrew on this host by
#                                    decision. The module manages ~/.npmrc,
#                                    which here holds an npm auth token, and it
#                                    would repoint the npm prefix away from the
#                                    globals installed under the brew prefix.
#   modules/packages/agents.nix    - external flakes not verified on darwin, and
#                                    cc-switch-cli is used as a GUI app here
#
# modules/shell/tmux.nix owns ~/.config/tmux/tmux.conf and installs tmux from
# nixpkgs, which shadows the Homebrew formula earlier on PATH. tmux prefers
# ~/.config/tmux/tmux.conf over ~/.tmux.conf, so the hand-written ~/.tmux.conf
# is no longer read once this is activated and can be dropped.
#
# modules/shell/zsh.nix owns ~/.zshrc, ~/.zshenv, ~/.zprofile, ~/.zimrc,
# ~/.p10k.zsh and ~/.config/zsh/veno.zsh. The hand-written ~/.zshrc it replaces
# is backed up by Home Manager as ~/.zshrc.backup on the first activation.
#
# chezmoi is retired on this host. ~/.config/nvim stays its own git repository
# (github.com/U1traVeno/nvim, outside this repo); yazi.toml is now managed here
# from config/yazi/yazi.toml; ~/.config/opencode is deliberately local-only
# because its opencode.json embeds provider API keys and must never be
# committed anywhere. nuclei was dropped outright along with its template
# store, as were the antsword formula and the ehole binary.
{
  imports = [
    ../modules/programs/pi-agent.nix
    ../modules/shell/zsh.nix
    ../modules/shell/tmux.nix
    ../modules/shell/direnv.nix
    ../modules/packages/base.nix
    ../modules/packages/modern-unix.nix
    ../modules/packages/modern-tui.nix
    ../modules/packages/python.nix
    ../modules/packages/golang.nix
    ../modules/packages/rust.nix
    ../modules/packages/cli.nix
    ../modules/packages/media.nix
  ];

  home = {
    username = "veno";
    homeDirectory = "/Users/veno";
    stateVersion = "26.05";

    # CLI set migrated out of Homebrew (the packages carry the same names as
    # the brew formulae they replace; uninstall those after switching).
    # sevenzip (7zz) deliberately stays with Homebrew: nixpkgs only has the
    # older p7zip with different command names. gh, tea and ffmpeg arrive via
    # the cli.nix/media.nix imports above, and the brew tmux and tree-sitter
    # formulae are already shadowed by modules/shell/tmux.nix and
    # modules/packages/base.nix.
    packages = with pkgs; [
      aria2
      hugo
      imagemagick
      ncdu
      nmap
      # Reads this Mac's clipboard image for clipbridge (see below).
      pngpaste
      tmuxai
      tldr
      tree
      wget
      yt-dlp
    ];

    # `cargo install` puts sm, derivon and mdbook here rather than in the nix
    # profile, so this stays on PATH even though cargo itself comes from
    # modules/packages/rust.nix.
    sessionPath = [
      "$HOME/.cargo/bin"
      # Homebrew's zip is keg-only, and /etc/paths.d/homebrew only covers
      # /opt/homebrew/bin.
      "/opt/homebrew/opt/zip/bin"
    ];

    sessionVariables = {
      EDITOR = "nvim";
      DOCKER_BUILDKIT = "1";
    };
  };

  # C-Space is this host's tmux prefix so that a bare Ctrl-b reaches the tmux
  # on the far side of an SSH session instead of this one (the pairing is
  # documented in modules/shell/tmux.nix). At tmux's default Ctrl-b nothing
  # needs to be said at all -- see hosts/thinkpad-veno.nix.
  programs.tmux.prefix = "C-Space";

  # clipbridge: lets Claude Code on the ThinkPad paste images from this Mac's
  # clipboard. Every SSH session to the ThinkPad (`fedora`, reached through
  # frp) forwards its 127.0.0.1:47851 back to this Mac's sshd, and the xclip
  # stand-in there runs `pngpaste` / `pbpaste` here through it (see
  # hosts/thinkpad-veno.nix). This needs Remote Login enabled and the
  # ThinkPad's key in ~/.ssh/authorized_keys.
  #
  # ~/.ssh/config stays hand-written (it holds machine-local entries), so it
  # pulls this in with `Include ~/.ssh/clipbridge.conf` near its top, before
  # any Host block. A second concurrent session just fails to bind the port
  # with a warning while the first one keeps serving the same clipboard.
  home.file.".ssh/clipbridge.conf".text = ''
    Host fedora
      RemoteForward 127.0.0.1:47851 localhost:22
  '';

  # yazi itself comes from modules/packages/modern-tui.nix; the config moved
  # here when chezmoi was retired (see the header comment).
  xdg.configFile."yazi/yazi.toml".source = ../config/yazi/yazi.toml;

  programs.zsh = {
    shellAliases = {
      # Both of these come from Homebrew and are macOS-only.
      tai = "tmuxai";
      typora = "open -a typora";
    };

    # OrbStack's installer appended this stanza to ~/.zprofile, which Home
    # Manager now owns and rewrites on every activation.
    #
    # The PATH line is not redundant. ~/.zshenv sources hm-session-vars.sh
    # before /etc/zprofile runs path_helper, and hm-session-vars.sh applies only
    # once per shell (__HM_SESS_VARS_SOURCED), so for a login shell the
    # second sourcing from ~/.zprofile is a no-op. path_helper therefore gets
    # the last word: it re-sorts PATH so that /usr/bin and /opt/homebrew/bin
    # come before the nix profile, which silently swaps in the system git,
    # python3, jq and zip. Re-assert the declared order after it; the
    # `typeset -U path` that Home Manager emits in ~/.zshrc drops duplicates.
    profileExtra = ''
      export PATH="${lib.concatStringsSep ":" config.home.sessionPath}''${PATH:+:}$PATH"

      # Added by OrbStack: command-line tools and integration
      source ~/.orbstack/shell/init.zsh 2>/dev/null || :
    '';
  };

  programs.home-manager.enable = true;
}
