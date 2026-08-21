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
        "veno@thinkpad" = {
          system = "x86_64-linux";
          module = ./hosts/thinkpad-veno.nix;
        };
        "hermes-fp@thinkpad" = {
          system = "x86_64-linux";
          module = ./hosts/thinkpad-hermes.nix;
        };
        "hermes-d@thinkpad" = {
          system = "x86_64-linux";
          module = ./hosts/thinkpad-hermes-d.nix;
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

      # Exposes each home as a flake check so that `nix flake check
      # --all-systems` evaluates every host from any machine, including the
      # Linux ones from macOS. Evaluation instantiates the derivation without
      # building it, which catches bad option names, missing packages and
      # platform-unsupported packages. It does NOT catch compile failures or
      # modules that silently no-op on the wrong platform.
      checks = lib.genAttrs systems (system:
        lib.mapAttrs'
          (name: _: lib.nameValuePair
            "home-${lib.replaceStrings [ "@" ] [ "-" ] name}"
            self.homeConfigurations.${name}.activationPackage)
          (lib.filterAttrs (_: h: h.system == system) hosts));
    };
}
