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
    # Nix's own CLI (`nix`, `nix-build`, ...) lives in the system default
    # profile, while `$HOME/.nix-profile` only holds the Home Manager profile.
    # Without this, `home-manager` resolves but its internal `nix build` call
    # fails with "nix: command not found".
    "/nix/var/nix/profiles/default/bin"
    "$HOME/.local/bin"
  ];
}
