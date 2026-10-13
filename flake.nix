{
  description = "U1traVeno's Home Manager configuration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    external-packages = {
      url = "path:./packages/external";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ self, nixpkgs, home-manager, ... }:
    let
      lib = nixpkgs.lib;

      # Single source of truth: every deployable home lives here so that both
      # `homeConfigurations` and `checks` are derived from the same table and
      # cannot drift apart.
      hosts = {
        # "headless" is a role, not a machine: the same home is used on every
        # headless x86_64 Linux box (the Fedora ThinkPad and the RHEL 9 VM).
        "veno@headless" = {
          system = "x86_64-linux";
          module = ./hosts/headless-veno.nix;
        };
        # The two hermes-* homes are planned for removal; the accounts are no
        # longer in use. Do not build new things on them.
        "hermes-fp@headless" = {
          system = "x86_64-linux";
          module = ./hosts/headless-hermes.nix;
        };
        "hermes-d@headless" = {
          system = "x86_64-linux";
          module = ./hosts/headless-hermes-d.nix;
        };
        "veno@macbook" = {
          system = "aarch64-darwin";
          module = ./hosts/macbook-veno.nix;
        };
      };

      systems = lib.unique (lib.mapAttrsToList (_: h: h.system) hosts);

      pkgsFor = system: import nixpkgs {
        inherit system;
        config.allowUnfree = true;
        overlays = [
          (import ./packages {
            externalPackages = inputs.external-packages;
          })
        ];
      };

      mkHome = system: module: home-manager.lib.homeManagerConfiguration {
        pkgs = pkgsFor system;
        modules = [ module ];
      };
    in {
      homeConfigurations =
        builtins.mapAttrs (_: h: mkHome h.system h.module) hosts;

      # Exposes each home as a flake check, which is what gives `nix flake
      # check --all-systems` something to validate and provides a stable
      # attribute for really building one host:
      #
      #   nix build .#checks.x86_64-linux.home-veno-headless
      #
      # Note that `nix flake check` only evaluates checks for other systems but
      # actually builds the ones matching the current system, so it is slow on
      # a cold store. CI therefore instantiates homeConfigurations directly
      # instead; see .github/workflows/check.yml.
      #
      # Evaluation catches bad option names, missing packages, packages
      # unsupported on the target platform and failed assertions. It does NOT
      # catch compile failures, nor a module that silently no-ops on the wrong
      # platform unless that module asserts its platform explicitly.
      checks = lib.genAttrs systems (system:
        lib.mapAttrs'
          (name: _: lib.nameValuePair
            "home-${lib.replaceStrings [ "@" ] [ "-" ] name}"
            self.homeConfigurations.${name}.activationPackage)
          (lib.filterAttrs (_: h: h.system == system) hosts));
    };
}
