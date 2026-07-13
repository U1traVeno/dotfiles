{
  description = "U1traVeno's Home Manager configuration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    cc-switch-cli = {
      url = "github:SaladDay/cc-switch-cli";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, home-manager, cc-switch-cli, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
        overlays = [ (import ./packages) ];
      };
    in {
      homeConfigurations."veno@thinkpad" = home-manager.lib.homeManagerConfiguration {
        inherit pkgs;
        extraSpecialArgs = { inherit cc-switch-cli; };
        modules = [ ./hosts/thinkpad.nix ];
      };
    };
}
