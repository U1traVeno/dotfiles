{
  description = "Third-party flake packages";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";

    cc-switch-cli = {
      url = "github:SaladDay/cc-switch-cli";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ self, nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "riscv64-linux"
        "x86_64-darwin"
        "x86_64-linux"
      ];
      packageInputs = builtins.removeAttrs inputs [
        "nixpkgs"
        "self"
      ];
      forAllSystems = function:
        builtins.listToAttrs (
          map (system: {
            name = system;
            value = function system;
          }) systems
        );
    in
    {
      packages = forAllSystems (
        system:
        builtins.mapAttrs (_: input: input.packages.${system}.default) packageInputs
      );
    };
}
