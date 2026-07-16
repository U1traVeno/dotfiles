{ pkgs, ... }:
{
  home.packages = with pkgs; [
    clang
    (lib.hiPrio gcc)
  ];
}
