{ pkgs, ... }:
{
  home.packages = with pkgs; [
    btop
    cc-switch-cli
    gitui
    lazydocker
    lazygit
    yazi
  ];
}
