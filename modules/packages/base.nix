{ pkgs, ... }:
{
  home.packages = with pkgs; [
    curl
    fzf
    git
    jq
    zimfw
    neovim
  ];

  home.sessionPath = [
    "$HOME/.local/bin"
  ];
}
