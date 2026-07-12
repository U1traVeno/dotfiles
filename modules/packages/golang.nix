{ pkgs, ... }:
{
  home.packages = with pkgs; [
    delve
    go
    golangci-lint
    gopls
  ];
}
