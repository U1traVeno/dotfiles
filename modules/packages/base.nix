{ pkgs, ... }:
{
  home.packages = with pkgs; [
    curl
    fzf
    git
    jq
    zimfw
  ];
}
