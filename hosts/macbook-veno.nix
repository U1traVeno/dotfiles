{ ... }:
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
#   modules/shell/zsh.nix          - would take over ~/.zshrc (zim + p10k)
#   modules/shell/tmux.nix         - would take over the tmux config
#   modules/packages/agents.nix    - external flakes not verified on darwin, and
#                                    cc-switch-cli is used as a GUI app here
{
  imports = [
    # NOTE: shell/zsh.nix is not imported here, so Home Manager cannot install
    # direnv's zsh hook. ~/.zshrc sources it by hand until that changes.
    ../modules/shell/direnv.nix
    ../modules/packages/base.nix
    ../modules/packages/modern-unix.nix
    ../modules/packages/modern-tui.nix
    ../modules/packages/python.nix
    ../modules/packages/golang.nix
    ../modules/packages/rust.nix
  ];

  home = {
    username = "veno";
    homeDirectory = "/Users/veno";
    stateVersion = "26.05";
  };

  programs.home-manager.enable = true;
}
