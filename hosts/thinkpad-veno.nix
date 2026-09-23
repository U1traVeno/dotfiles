{ ... }:
{
  imports = [
    ../modules/programs/pi-agent.nix
    ../modules/shell/zsh.nix
    (import ../modules/shell/tmux.nix { dualPrefix = false; })
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
  };

  programs.home-manager.enable = true;
}
