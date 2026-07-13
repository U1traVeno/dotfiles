{ pkgs, ... }:
{
  home.packages = with pkgs; [
    codex
    opencode
  ];
}
