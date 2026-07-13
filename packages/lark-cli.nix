{
  fetchurl,
  lib,
  nix-update-script,
  stdenvNoCC,
}:

let
  sources = {
    aarch64-darwin = {
      asset = "darwin-arm64";
      hash = "sha256-DkRJFoEz4tsIA25EKgulrEDL1avfoHHLH/1pLbS+q6k=";
    };
    aarch64-linux = {
      asset = "linux-arm64";
      hash = "sha256-8WC8+gt7wk3nV8NztuYm3oGER1CezVSYQoX5ZlXGUvw=";
    };
    riscv64-linux = {
      asset = "linux-riscv64";
      hash = "sha256-99RN1dX2j/cRaREMzPTHAlSBUUIoIOxPmyEdu9PsxIc=";
    };
    x86_64-darwin = {
      asset = "darwin-amd64";
      hash = "sha256-Tl81obeVd94UsqYk2nffxKIOpWq9mGQtZ54HMFgQWKY=";
    };
    x86_64-linux = {
      asset = "linux-amd64";
      hash = "sha256-Ik4fjAS7GU1mjHUJKMWy9JQrv/1ioRjD3BY/J+5uXAk=";
    };
  };
  source = sources.${stdenvNoCC.hostPlatform.system};
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "lark-cli";
  version = "1.0.69";

  src = fetchurl {
    url = "https://github.com/larksuite/cli/releases/download/v${finalAttrs.version}/lark-cli-${finalAttrs.version}-${source.asset}.tar.gz";
    inherit (source) hash;
  };

  sourceRoot = ".";

  installPhase = ''
    runHook preInstall

    install -Dm755 lark-cli "$out/bin/lark-cli"

    runHook postInstall
  '';

  passthru.updateScript = nix-update-script { };

  meta = {
    description = "Official CLI for Lark/Feishu Open Platform";
    homepage = "https://github.com/larksuite/cli";
    license = lib.licenses.mit;
    mainProgram = "lark-cli";
    platforms = builtins.attrNames sources;
  };
})
