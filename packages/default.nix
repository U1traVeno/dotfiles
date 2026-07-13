{ externalPackages }:

final: prev:

let
  system = prev.stdenv.hostPlatform.system;
in
externalPackages.packages.${system}
// {
  lark-cli = final.callPackage ./lark-cli.nix { };
}
