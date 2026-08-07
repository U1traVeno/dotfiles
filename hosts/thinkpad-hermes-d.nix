{ ... }:
{
  imports = [
    ../modules/packages/base.nix
    ../modules/packages/node.nix
    ../modules/packages/modern-unix.nix
    ../modules/packages/cli.nix
  ];

  home = {
    username = "hermes-d";
    homeDirectory = "/home/hermes-d";
    stateVersion = "26.05";
  };

  programs.home-manager.enable = true;
}
