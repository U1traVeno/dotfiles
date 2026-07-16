{ ... }:
{
  imports = [
    ../modules/shell
    ../modules/packages/base.nix
    ../modules/packages/modern-unix.nix
    ../modules/packages/modern-tui.nix
    ../modules/packages/media.nix
    ../modules/packages/agents.nix
    ../modules/packages/node.nix
    ../modules/packages/python.nix
    ../modules/packages/golang.nix
    ../modules/packages/compilers.nix
    ../modules/services/frp.nix
  ];

  home = {
    username = "veno";
    homeDirectory = "/home/veno";
    stateVersion = "26.05";
  };

  programs.home-manager.enable = true;
}
