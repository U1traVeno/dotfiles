{ config, pkgs, ... }:
{
  home.packages = with pkgs; [
    nodejs
    pnpm
    yarn
    bun
  ];

  home.sessionPath = [
    "$HOME/.local/share/npm/bin"
  ];

  home.file.".npmrc".text = ''
    prefix=${config.home.homeDirectory}/.local/share/npm
  '';
}
