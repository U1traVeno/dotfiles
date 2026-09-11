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
      runtimeInputs = [ pkgs.git pkgs.jq ];
      text = ''
        repo=${lib.escapeShellArg dotfilesDir}

        case "''${1:-}" in
          "") ;;
          -h|--help)
            printf '%s\n' 'Usage: pi-sync'
            printf '%s\n' 'Pull dotfiles, reconcile Pi packages, apply Home Manager, and update Pi extensions.'
            exit 0
            ;;
          *)
            printf 'pi-sync: unexpected argument: %s\n' "$1" >&2
            exit 2
            ;;
        esac

        git -C "$repo" pull --ff-only

        # Reconcile the Pi npm prefix with pi/settings.json before linking the new
        # generation. `pi update --extensions` installs and updates the configured
        # sources but never removes a package that was dropped from settings, and a
        # leftover package that registers the same tool name as a local extension
        # makes Pi refuse to start at all.
        #
        # `pi remove` uninstalls the package and only afterwards looks it up in
        # settings (removeAndPersist: remove(), then removeSourceFromSettings()), so
        # for a package that is deliberately absent it always exits 1 with
        # "No matching package found". That status is expected here; re-reading the
        # npm manifest below is what proves the uninstall actually happened.
        pi_npm_manifest="''${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/npm/package.json"
        pi_settings="$repo/pi/settings.json"

        if [ -f "$pi_settings" ] && [ -f "$pi_npm_manifest" ]; then
          # Configured package names: drop the "npm:" prefix and any version suffix.
          # Scoped names keep their leading "@", so cut at the last "@".
          if ! configured="$(jq -r '
            .packages[]?
            | (if type == "string" then . else .source // "" end)
            | select(startswith("npm:"))
            | ltrimstr("npm:")
            | sub("@[^@/]+$"; "")
          ' "$pi_settings")"; then
            printf 'pi-sync: cannot parse %s; removing no Pi package\n' "$pi_settings" >&2
            exit 1
          fi

          stale_status=0
          while IFS= read -r name; do
            if [ -z "$name" ] || printf '%s\n' "$configured" | grep -Fxq -- "$name"; then
              continue
            fi
            printf 'pi-sync: removing Pi package that settings no longer lists: %s\n' "$name"
            # Expected to exit 1: see the comment above.
            remove_output="$(pi remove "npm:$name" 2>&1)" || true
            if jq -e --arg name "$name" '.dependencies | has($name)' "$pi_npm_manifest" >/dev/null 2>&1; then
              printf 'pi-sync: could not remove %s:\n%s\n' "$name" "$remove_output" >&2
              stale_status=1
            fi
          done < <(jq -r '.dependencies // {} | keys[]' "$pi_npm_manifest")

          if [ "$stale_status" -ne 0 ]; then
            printf '%s\n' 'pi-sync: stale Pi packages remain; fix them before starting Pi' >&2
            exit 1
          fi
        fi

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

  home.file.".pi/agent/extensions/shift-enter.ts" = {
    force = true;
    source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/pi/extensions/shift-enter.ts";
  };

  home.file.".pi/agent/extensions/goal" = {
    force = true;
    source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/pi/extensions/goal";
  };

  home.file.".pi/agent/extensions/qiniu" = {
    force = true;
    source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/pi/extensions/qiniu";
  };

  home.file.".pi/agent/extensions/openlux" = {
    force = true;
    source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/pi/extensions/openlux";
  };

  # Local fork of @jerryan/pi-subagent-lite: the upstream version reported every
  # failed child run as a successful "(no output)". Owned here rather than by npm
  # so the fix cannot be overwritten by `pi update --extensions`.
  home.file.".pi/agent/extensions/subagent" = {
    force = true;
    source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/pi/extensions/subagent";
  };

  home.file.".pi/agent/goal.json" = {
    force = true;
    source = config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/pi/goal.json";
  };
}
