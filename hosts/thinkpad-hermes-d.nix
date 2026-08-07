{ ... }:
{
  imports = [
    ../modules/packages/base.nix
    ../modules/packages/node.nix
    ../modules/packages/modern-unix.nix
    ../modules/packages/cli.nix
  ];

  home = {
    username = "hermes-d";
    homeDirectory = "/home/hermes-d";
    stateVersion = "26.05";
  };

  # Source home-manager session vars (PATH, etc.) in bash
  # （与 thinkpad-hermes.nix 保持一致，否则 npm 全局 bin 不在 PATH）
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
