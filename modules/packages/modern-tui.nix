{ pkgs, ... }:
{
  home.packages = with pkgs; [
    btop
    lazydocker
    lazygit
    yazi
  ];
}
