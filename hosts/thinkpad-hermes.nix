{ ... }:
{
  imports = [
    ../modules/packages/base.nix
    ../modules/packages/node.nix
    ../modules/packages/modern-unix.nix
    ../modules/packages/cli.nix
  ];

  home = {
    username = "hermes-fp";
    homeDirectory = "/home/hermes-fp";
    stateVersion = "26.05";
  };

  programs.home-manager.enable = true;
}
