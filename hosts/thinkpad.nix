{ ... }:
{
  imports = [
    ../modules/shell
    ../modules/packages/base.nix
    ../modules/packages/lark-cli.nix
    ../modules/packages/modern-unix.nix
    ../modules/packages/modern-tui.nix
    ../modules/packages/agents.nix
  ];

  home = {
    username = "veno";
    homeDirectory = "/home/veno";
    stateVersion = "26.05";
  };

  programs.home-manager.enable = true;
}
