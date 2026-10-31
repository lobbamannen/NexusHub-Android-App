"""Regression checks for the reproducible native CMake cache identity."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "native-cache-key.py"
SPEC = importlib.util.spec_from_file_location("native_cache_key", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NativeCacheKeyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        for name in (*MODULE.REQUIRED, "app/src/main/cpp/native.cpp", "app/src/main/cpp/native.h"):
            self.write(name, "original source for " + name)
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)

    def write(self, name: str, content: str) -> None:
        dest = self.root / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")

    def test_unrelated_workflow_change_and_untracked_file_do_not_change_key(self):
        before, paths = MODULE.fingerprint(self.root)
        self.assertIn("app/src/main/cpp/native.cpp", paths)
        self.write(".github/workflows/android-apk.yml", "new release workflow")
        self.write("app/src/main/cpp/untracked.cpp", "untracked generated input")
        after, _ = MODULE.fingerprint(self.root)
        self.assertEqual(before, after)

    def test_changing_tracked_native_source_invalidates_cache(self):
        before, _ = MODULE.fingerprint(self.root)
        self.write("app/src/main/cpp/native.cpp", "different implementation")
        after, _ = MODULE.fingerprint(self.root)
        self.assertNotEqual(before, after)

    def test_changing_pinned_source_or_native_gradle_options_invalidates_cache(self):
        before, _ = MODULE.fingerprint(self.root)
        self.write("llama-revision.txt", "different pinned revision")
        self.assertNotEqual(before, MODULE.fingerprint(self.root)[0])
        self.write("llama-revision.txt", "original source for llama-revision.txt")
        self.write("app/build.gradle.kts", "different NDK flags")
        self.assertNotEqual(before, MODULE.fingerprint(self.root)[0])

    def test_native_fallback_download_name_matches_uploaded_artifact(self):
        import re
        workflow = (SCRIPT.parents[1] / ".github/workflows/android-apk.yml").read_text(encoding="utf-8")
        download = re.search(r"^\s+CORE_ARTIFACT:\s*(.+)$", workflow, re.MULTILINE)
        upload = re.search(
            r"- name: Preserve compiled core as immutable fallback artifact[\s\S]*?\n\s+name:\s*(.+)",
            workflow,
        )
        self.assertIsNotNone(download, "fallback download must declare its exact artifact name")
        self.assertIsNotNone(upload, "compiled core must be preserved under an exact artifact name")
        digest = "ab" * 32
        expression = "${{ steps.native-key.outputs.digest }}"
        wanted = download.group(1).strip().replace(expression, digest)
        produced = upload.group(1).strip().replace(expression, digest)
        self.assertEqual(wanted, produced, "fallback must find the immutable artifacts this workflow uploads")
        self.assertEqual(produced, "nexus-core-prebuilt-" + digest)


if __name__ == "__main__":
    unittest.main()
