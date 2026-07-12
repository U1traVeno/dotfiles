{ pkgs, ... }:
{
  home.packages = with pkgs; [
    bat
    bottom
    duf
    dust
    eza
    fd
    procs
    ripgrep
    zoxide
  ];
}
