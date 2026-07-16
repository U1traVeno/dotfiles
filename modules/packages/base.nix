{ pkgs, ... }:
{
  home.packages = with pkgs; [
    curl
    fzf
    git
    jq
    zimfw
    neovim
    frp
  ];

  home.sessionPath = [
    "$HOME/.local/bin"
  ];
}
