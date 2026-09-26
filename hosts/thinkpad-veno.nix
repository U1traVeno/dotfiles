{ pkgs, ... }:
let
  # Claude Code pastes images on Linux by shelling out to
  # `xclip -selection clipboard -t TARGETS|image/png -o` on the machine it
  # runs on. This headless box has no clipboard of its own; the images live on
  # the MacBook whose kitty/tmux this is being used from. That Mac forwards
  # 127.0.0.1:47851 here back to its own sshd (see clipbridge in
  # hosts/macbook-veno.nix), so this stand-in for xclip reads the Mac's
  # clipboard over that tunnel instead.
  #
  # The tunnel port is reachable by every local account, which is why it goes
  # through sshd rather than a bare listener: only a key that the Mac
  # authorizes gets in, and the pinned host key stops anything else that
  # squats on the port from receiving the connection.
  clipbridgeKnownHosts = pkgs.writeText "clipbridge-known-hosts" ''
    [127.0.0.1]:47851 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDAj00M4LeAKIevxCJQjwXqB/OizsKChpyP6vMqpvmSn
  '';

  xclip-clipbridge = pkgs.writeShellApplication {
    name = "xclip";
    text = ''
      selection=clipboard target="" output=""
      while [ $# -gt 0 ]; do
        case "$1" in
          -selection|-sel) selection=$2; shift ;;
          -t|-target) target=$2; shift ;;
          -o|-out) output=1 ;;
        esac
        shift
      done

      # Only reading the clipboard selection is bridged.
      if [ "$selection" != clipboard ] || [ -z "$output" ]; then
        echo "xclip: only 'xclip -selection clipboard [-t ...] -o' is bridged to the Mac" >&2
        exit 1
      fi

      mac() {
        ssh -p 47851 \
          -o BatchMode=yes -o ConnectTimeout=3 \
          -o UserKnownHostsFile=${clipbridgeKnownHosts} -o StrictHostKeyChecking=yes \
          -o ClearAllForwardings=yes \
          -o ControlMaster=auto -o ControlPersist=60 \
          -o ControlPath="$HOME/.cache/clipbridge-%C" \
          veno@127.0.0.1 "$@"
      }

      # The tildes are meant for the Mac's shell, not this one.
      # shellcheck disable=SC2088
      case "$target" in
        TARGETS) mac '~/.nix-profile/bin/pngpaste - >/dev/null 2>&1' && echo image/png ;;
        image/png) mac '~/.nix-profile/bin/pngpaste -' ;;
        ""|text/plain|UTF8_STRING|STRING) mac pbpaste ;;
        *) exit 1 ;;
      esac
    '';
  };
in
{
  imports = [
    ../modules/programs/pi-agent.nix
    ../modules/shell/zsh.nix
    ../modules/shell/tmux.nix
    ../modules/shell/direnv.nix
    ../modules/packages/base.nix
    ../modules/packages/node.nix
    ../modules/packages/modern-unix.nix
    ../modules/packages/modern-tui.nix
    ../modules/packages/media.nix
    ../modules/packages/agents.nix
    ../modules/packages/python.nix
    ../modules/packages/golang.nix
    ../modules/packages/rust.nix
    ../modules/packages/compilers.nix
    ../modules/packages/cli.nix
    ../modules/services/frp.nix
  ];

  home = {
    username = "veno";
    homeDirectory = "/home/veno";
    stateVersion = "26.05";

    # `cargo install` puts binaries here rather than in the nix profile, so
    # this stays on PATH even though cargo itself comes from
    # modules/packages/rust.nix.
    sessionPath = [ "$HOME/.cargo/bin" ];

    packages = [ xclip-clipbridge ];
  };

  programs.home-manager.enable = true;
}
