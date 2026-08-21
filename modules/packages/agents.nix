{ pkgs, ... }:
{
  home.packages = with pkgs; [
    # Claude Code provider switcher. Lives here rather than in modern-tui.nix
    # because it is agent tooling, and because hosts that use the GUI build
    # instead should not pick it up with the generic TUI group.
    cc-switch-cli
    hermes-agent
    opencode
  ];
}
