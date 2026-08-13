{ pkgs, ... }:
{
  home.packages = with pkgs; [
    clang
    (lib.hiPrio gcc)
    # `make` pairs with the compiler toolchain and is required by
    # node-gyp to compile native npm modules (e.g. node-pty).
    gnumake
  ];
}
