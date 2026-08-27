{ config, lib, pkgs, ... }:

let
  dotfilesDir = "${config.home.homeDirectory}/dotfiles";
  homeConfiguration =
    if pkgs.stdenv.hostPlatform.isDarwin then
      "veno@macbook"
    else
      "veno@thinkpad";
in
{
  home.packages = [
    (pkgs.writeShellApplication {
      name = "pi-sync";
      runtimeInputs = [ pkgs.git ];
      text = ''
        repo=${lib.escapeShellArg dotfilesDir}

        case "''${1:-}" in
          "") ;;
          -h|--help)
            printf '%s\n' 'Usage: pi-sync'
            printf '%s\n' 'Pull dotfiles, apply Home Manager, and update Pi extensions.'
            exit 0
            ;;
          *)
            printf 'pi-sync: unexpected argument: %s\n' "$1" >&2
            exit 2
            ;;
        esac

        git -C "$repo" pull --ff-only
        home-manager switch --flake "path:$repo#${homeConfiguration}"
        pi update --extensions
      '';
    })
  ];

  # Keep Pi's mutable package state and credentials machine-local. Only the
  # shareable manifests point back to the dotfiles checkout so Pi can update
  # settings.json without trying to write through a read-only Nix store link.
  home.file.".pi/agent/settings.json" = {
    force = true;
    source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/pi/settings.json";
  };

  home.file.".pi/agent/models.json" = {
    force = true;
    source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/pi/models.json";
  };
}
