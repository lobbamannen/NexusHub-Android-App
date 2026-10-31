#!/usr/bin/env python3
"""Stable fingerprint of versioned inputs for NexusHub's prebuilt Android CMake core.

GitHub Actions hashFiles() can accidentally include changing workspace files or
have a changing match set. Only tracked, explicitly selected native inputs are
considered here; each file name and its bytes are hashed in a fixed order.
The pinned llama.cpp source is verified separately against llama-revision.txt.
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys

NATIVE_GLOBS = ("*.c", "*.cc", "*.cpp", "*.h", "*.hpp", "*.cmake")
REQUIRED = (
    "llama-revision.txt",
    "app/src/main/cpp/CMakeLists.txt",
    "app/build.gradle.kts",
    "gradle/libs.versions.toml",
    "scripts/patch-llama-cpu-jarvis-audit.py",
    "scripts/run-llama-cpu-jarvis-audit.py",
)
OPTIONAL = ("gradle.properties",)
TOOLCHAIN = "android-arm64-v8a:ndk-28.2.13676358:cmake-3.22.1"
SCHEMA = "nexus-core-native-inputs-v2"


def fingerprint(root: Path) -> tuple[str, list[str]]:
    root = root.resolve()
    patterns = list(REQUIRED) + list(OPTIONAL) + [
        ":(glob)app/src/main/cpp/" + pattern for pattern in NATIVE_GLOBS
    ]
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", *patterns],
        cwd=root,
        check=True,
        capture_output=True,
    )
    paths = sorted(set(x.decode("utf-8") for x in result.stdout.split(b"\0") if x))
    missing = set(REQUIRED) - set(paths)
    if missing:
        raise ValueError("Native cache inputs are not tracked: " + ", ".join(sorted(missing)))
    if not any(
        p.startswith("app/src/main/cpp/") and p.endswith((".c", ".cc", ".cpp"))
        for p in paths
    ):
        raise ValueError("No native C/C++ implementation files were found.")

    digest = hashlib.sha256()
    digest.update((SCHEMA + "\0" + TOOLCHAIN + "\0").encode("utf-8"))
    for name in paths:
        file = root / name
        if not file.is_file():
            raise ValueError(f"Tracked native input does not exist: {name}")
        digest.update(name.encode("utf-8") + b"\0")
        digest.update(hashlib.sha256(file.read_bytes()).digest())
    return digest.hexdigest(), paths


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--check", help="Fail when the native inputs changed during the build")
    args = parser.parse_args()

    try:
        digest, paths = fingerprint(args.root)
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"Native cache fingerprint failed: {exc}", file=sys.stderr)
        return 1
    print(f"Native cache fingerprint: {digest} ({len(paths)} tracked inputs)")
    if args.check is not None:
        if digest != args.check:
            print("Native cache inputs changed during compilation; refusing to cache stale binaries.", file=sys.stderr)
            return 1
        return 0
    if output := os.environ.get("GITHUB_OUTPUT"):
        with open(output, "a", encoding="utf-8") as file:
            file.write(f"digest={digest}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
