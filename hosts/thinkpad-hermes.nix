{ config, ... }:
{
  imports = [
    ../modules/packages/base.nix
    ../modules/packages/node.nix
    ../modules/packages/modern-unix.nix
    ../modules/packages/cli.nix
  ];

  home = {
    username = "hermes-fp";
    homeDirectory = "/home/hermes-fp";
    stateVersion = "26.05";
  };

  # Source home-manager session vars (PATH, etc.) in bash
  home.file = {
    ".bashrc.d/npm-path.sh" = {
      text = ''
        if [ -f "$HOME/.nix-profile/etc/profile.d/hm-session-vars.sh" ]; then
          . "$HOME/.nix-profile/etc/profile.d/hm-session-vars.sh"
        fi
      '';
      executable = false;
    };
  };

  programs.home-manager.enable = true;
}
