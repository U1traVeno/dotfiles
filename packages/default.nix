{ externalPackages }:

final: prev:

let
  system = prev.stdenv.hostPlatform.system;
in
externalPackages.packages.${system}
// {
}
