{ pkgs, ... }:
{
  home.packages = with pkgs; [
    btop
    gitui
    lazydocker
    lazygit
    yazi
  ];
}
