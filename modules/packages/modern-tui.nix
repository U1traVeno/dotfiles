{ pkgs, ... }:
{
  home.packages = with pkgs; [
    btop
    cc-switch-cli
    lazydocker
    lazygit
    yazi
  ];
}
