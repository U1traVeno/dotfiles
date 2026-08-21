{ lib, pkgs, ... }:
{
  # systemd.user.enable defaults to false off Linux, so without this assertion
  # importing this module on darwin evaluates and builds cleanly while the
  # service silently never exists. Fail loudly instead.
  assertions = [
    (lib.hm.assertions.assertPlatform "services.frp" pkgs lib.platforms.linux)
  ];

  home.packages = [ pkgs.frp ];

  systemd.user.services.frpc = {
    Unit = {
      Description = "FRP client";
      ConditionPathExists = "%h/.config/frp/frpc.toml";
    };

    Service = {
      ExecStart = "${pkgs.frp}/bin/frpc -c %h/.config/frp/frpc.toml";
      Restart = "always";
      RestartSec = 5;
    };

    Install.WantedBy = [ "default.target" ];
  };
}
