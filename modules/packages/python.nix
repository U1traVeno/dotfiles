{ pkgs, ... }:
{
  home.packages = with pkgs; [
    pyright
    python3
    ruff
    ty
    uv
  ];
}
