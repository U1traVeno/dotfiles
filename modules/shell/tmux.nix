{ ... }:
{
  programs.tmux = {
    enable = true;
    terminal = "tmux-256color";
    extraConfig = builtins.readFile ../../config/tmux.conf;
  };
}
