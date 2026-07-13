{
  fetchurl,
  lib,
  nix-update-script,
  stdenvNoCC,
}:

stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "lark-cli";
  version = "1.0.69";

  src = fetchurl {
    url = "https://github.com/larksuite/cli/releases/download/v${finalAttrs.version}/lark-cli-${finalAttrs.version}-linux-amd64.tar.gz";
    hash = "sha256-Ik4fjAS7GU1mjHUJKMWy9JQrv/1ioRjD3BY/J+5uXAk=";
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
    platforms = [ "x86_64-linux" ];
  };
})
