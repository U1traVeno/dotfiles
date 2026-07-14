{ pkgs, ... }:
{
  home.packages = with pkgs; [
    hermes-agent
    opencode
  ];
}
