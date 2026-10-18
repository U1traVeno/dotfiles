{ ... }:
# Point nixpkgs-built git and curl at the distribution's CA bundle.
#
# Nix-built tools look for /etc/ssl/certs/ca-certificates.crt, a Debian-style
# name. Fedora ships it; RHEL 9 does not, so there `git pull` and `curl` fail
# with "unable to get local issuer certificate". The one path both provide, as a
# link to the same p11-kit bundle, is /etc/ssl/certs/ca-bundle.crt.
#
# This is the single place for distribution differences in CA trust. A host
# whose bundle lives elsewhere should adjust it here, not in a host file.
#
# Session variables only reach login shells. A non-login `ssh host 'git pull'`
# has to set GIT_SSL_CAINFO itself.
{
  home.sessionVariables = {
    SSL_CERT_FILE = "/etc/ssl/certs/ca-bundle.crt";
    GIT_SSL_CAINFO = "/etc/ssl/certs/ca-bundle.crt";
  };
}
