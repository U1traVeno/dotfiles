{ pkgs, ... }:
{
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
