{ pkgs, ... }:
{
  home.packages = with pkgs; [
    curl
    fzf
    git
    jq
    zimfw
    neovim
    # Parser generator for nvim-treesitter. Upstream asks for the package
    # manager build rather than the npm one.
    tree-sitter
  ];

  home.sessionPath = [
    "$HOME/.nix-profile/bin"
    "$HOME/.local/bin"
  ];
}
