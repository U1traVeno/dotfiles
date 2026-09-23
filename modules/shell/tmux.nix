# Shared tmux configuration, imported with arguments from hosts:
#
#   (import ../modules/shell/tmux.nix { })
#     # Ctrl-Space primary + Ctrl-b secondary prefix
#   (import ../modules/shell/tmux.nix { dualPrefix = false; })
#     # Ctrl-b only: tmux's own default, nothing extra is bound
{ dualPrefix ? true }:
{ lib, ... }:
{
  programs.tmux = {
    enable = true;
    terminal = "tmux-256color";
    extraConfig =
      builtins.readFile ../../config/tmux.conf
      + lib.optionalString dualPrefix (builtins.readFile ../../config/tmux-prefix-dual.conf);
  };
}
