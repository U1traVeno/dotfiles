{ pkgs, cc-switch-cli, ... }:
{
  home.packages = with pkgs; [
    btop
    cc-switch-cli.packages.${pkgs.system}.cc-switch-cli
    gitui
    lazydocker
    lazygit
    yazi
  ];
}
