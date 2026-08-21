{ pkgs, ... }:
# Baseline Rust toolchain. Projects that need a pinned or nightly toolchain
# override it from their own flake devShell.
#
# Linking needs a system C compiler: compilers.nix on Linux, the Xcode
# Command Line Tools (/usr/bin/cc) on darwin.
{
  home.packages = with pkgs; [
    cargo
    clippy
    rust-analyzer
    rustc
    rustfmt
  ];
}
