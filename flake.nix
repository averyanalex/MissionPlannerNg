{
  description = "MissionPlannerNg development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    systems.url = "github:nix-systems/default";
    flake-utils = {
      url = "github:numtide/flake-utils";
      inputs.systems.follows = "systems";
    };
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs =
    {
      self,
      nixpkgs,
      systems,
      flake-utils,
      rust-overlay,
    }:
    flake-utils.lib.eachSystem (import systems) (
      system:
      let
        overlays = [
          (import rust-overlay)
        ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        lib = pkgs.lib;

        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [
            "clippy"
            "rust-analyzer"
            "rust-src"
            "rustfmt"
          ];
        };

        linuxDeps = with pkgs; [
          atk
          cairo
          gdk-pixbuf
          glib
          gtk3
          librsvg
          libsoup_3
          openssl
          pango
          webkitgtk_4_1
        ];

        darwinDeps = with pkgs.darwin.apple_sdk.frameworks; [
          AppKit
          Cocoa
          CoreFoundation
          CoreServices
          Security
          WebKit
        ];
      in
      {
        devShells.default = pkgs.mkShell {
          packages =
            (with pkgs; [
              cargo-tauri
              nodejs_20
              pkg-config
              rustToolchain
            ])
            ++ lib.optionals pkgs.stdenv.isLinux linuxDeps
            ++ lib.optionals pkgs.stdenv.isDarwin darwinDeps;

          RUST_SRC_PATH = "${rustToolchain}/lib/rustlib/src/rust/library";
          LD_LIBRARY_PATH = lib.optionalString pkgs.stdenv.isLinux (lib.makeLibraryPath linuxDeps);

          shellHook = ''
            export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS"
          '';
        };
      }
    );
}
