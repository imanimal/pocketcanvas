"""Package PocketCanvas (stdlib only).

    python tools/build.py              dist/pocketcanvas-<version>.zip, the unsigned extension (load it in
                                       about:debugging, or sign it on addons.mozilla.org)
    python tools/build.py --updates    also dist/updates.json, the update manifest Firefox polls
                                       (manifest.json's update_url points at the latest release's copy)
    python tools/build.py --bump 0.2.0 set the version in manifest.json first

Releases are built by .github/workflows/release.yml, which signs the package as an unlisted add-on and attaches
the .xpi and updates.json to the GitHub release."""
import argparse
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "imanimal/pocketcanvas"
INCLUDE = ["manifest.json", "LICENSE", "src", "icons"]


def manifest():
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
        return json.load(f)


def bump(version):
    path = os.path.join(ROOT, "manifest.json")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    old = json.loads(text)["version"]
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text.replace(f'"version": "{old}"', f'"version": "{version}"', 1))
    print(f"version {old} -> {version}")


def package(dist):
    m = manifest()
    out = os.path.join(dist, f"pocketcanvas-{m['version']}.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for item in INCLUDE:
            full = os.path.join(ROOT, item)
            if os.path.isfile(full):
                z.write(full, item)
                continue
            for base, _, files in os.walk(full):
                for name in sorted(files):
                    p = os.path.join(base, name)
                    z.write(p, os.path.relpath(p, ROOT).replace(os.sep, "/"))
    print(out)
    return out


def updates(dist):
    m = manifest()
    gecko = m["browser_specific_settings"]["gecko"]
    v = m["version"]
    doc = {"addons": {gecko["id"]: {"updates": [{
        "version": v,
        "update_link": f"https://github.com/{REPO}/releases/download/v{v}/pocketcanvas-{v}.xpi",
        "applications": {"gecko": {"strict_min_version": gecko.get("strict_min_version", "128.0")}},
    }]}}}
    out = os.path.join(dist, "updates.json")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, indent=2)
    print(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--updates", action="store_true")
    ap.add_argument("--bump")
    a = ap.parse_args()
    if a.bump:
        bump(a.bump)
    dist = os.path.join(ROOT, "dist")
    os.makedirs(dist, exist_ok=True)
    package(dist)
    if a.updates:
        updates(dist)


if __name__ == "__main__":
    main()
