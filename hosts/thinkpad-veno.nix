{ ... }:
{
  imports = [
    ../modules/programs/pi-agent.nix
    ../modules/shell/zsh.nix
    ../modules/shell/tmux.nix
    ../modules/shell/direnv.nix
    ../modules/packages/base.nix
    ../modules/packages/node.nix
    ../modules/packages/modern-unix.nix
    ../modules/packages/modern-tui.nix
    ../modules/packages/media.nix
    ../modules/packages/agents.nix
    ../modules/packages/python.nix
    ../modules/packages/golang.nix
    ../modules/packages/rust.nix
    ../modules/packages/compilers.nix
    ../modules/packages/cli.nix
    ../modules/services/frp.nix
  ];

  home = {
    username = "veno";
    homeDirectory = "/home/veno";
    stateVersion = "26.05";

    # `cargo install` puts binaries here rather than in the nix profile, so
    # this stays on PATH even though cargo itself comes from
    # modules/packages/rust.nix.
    sessionPath = [ "$HOME/.cargo/bin" ];
  };

  programs.home-manager.enable = true;
}
