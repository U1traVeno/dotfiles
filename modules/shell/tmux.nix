# Shared tmux configuration. The prefix key is deliberately not configured
# here: a host that takes tmux's own default Ctrl-b needs no annotation at
# all, and a host that deviates sets the standard Home Manager option --
#
#   programs.tmux.prefix = "C-Space";
#
# -- which Home Manager turns into `unbind C-b` plus a rebind to the new key.
# The pairing this serves is nested tmux over SSH: a host driven from a
# terminal emulator takes Ctrl-Space, a host used as a server takes Ctrl-b. A
# single Ctrl-b typed on the client then passes straight through to the tmux
# on the far side of the SSH session, Ctrl-Space drives the local one, and no
# keystroke is claimed by both layers.
{ ... }:
{
  programs.tmux = {
    enable = true;
    terminal = "tmux-256color";
    extraConfig = builtins.readFile ../../config/tmux.conf;
  };
}
