#!/usr/bin/env python3
"""Generate an OpenAPI-style inventory for the Rust Soroban contracts."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts"
OUT = ROOT / "docs" / "contracts" / "interface.md"


def clean_type(value: str) -> str:
    value = re.sub(r"\s+", " ", value.strip())
    return value.replace("&", "")


def parse_package(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    functions: list[tuple[str, str]] = []
    types: list[str] = []
    events: set[str] = set()
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        type_match = re.match(r"\s*pub (?:struct|enum|type)\s+(\w+)", line)
        if type_match:
            types.append(type_match.group(1))
        if "events().publish" in line:
            events.update(re.findall(r'symbol_short!\("([^"].*)"\)', line))
        if re.match(r"\s*pub fn\s+\w+", line):
            signature = line.strip()
            while "{" not in signature and i + 1 < len(lines):
                i += 1
                signature += " " + lines[i].strip()
            signature = signature.split("{")[0].strip()
            signature = re.sub(r"\s+", " ", signature)
            name = re.search(r"pub fn\s+(\w+)", signature)
            if name:
                functions.append((name.group(1), signature))
        i += 1
    return {"functions": functions, "types": sorted(set(types)), "events": sorted(events)}


def render() -> str:
    packages = []
    for source in sorted(CONTRACTS.glob("*/src/lib.rs")):
        package = parse_package(source)
        if package["functions"] or package["types"] or package["events"]:
            packages.append((source.parent.parent.name, package))
    lines = [
        "# Soroban Contract Interface Reference",
        "",
        "> This document is the repository’s OpenAPI-style contract interface catalog. It is generated from the checked-in Rust sources so function names, parameter types, return types, public data types, and event topics remain reviewable alongside the ABI-producing code.",
        "",
        "## Interface conventions",
        "",
        "| Field | Meaning |",
        "|---|---|",
        "| Function | Soroban contract entry point exposed by `#[contractimpl]`. |",
        "| Parameters | Ordered ABI parameters, including the mandatory `Env` receiver omitted from the public call shape. |",
        "| Returns | Rust return type encoded by the Soroban SDK. `()` means no return value. |",
        "| Events | Topic labels observed in `env.events().publish`; event data is the tuple published by the source. |",
        "",
        "## Contract index",
        "",
        "| Contract | Functions | Types | Events |",
        "|---|---:|---:|---:|",
    ]
    for name, package in packages:
        lines.append(f"| `{name}` | {len(package['functions'])} | {len(package['types'])} | {len(package['events'])} |")
    lines += ["", "## Contract interfaces", ""]
    for name, package in packages:
        lines += [f"### `{name}`", ""]
        lines += ["#### Functions", "", "| Name | ABI signature |", "|---|---|"]
        for function, signature in package["functions"]:
            public_signature = signature.replace("pub fn ", "fn ", 1)
            lines.append(f"| `{function}` | `{public_signature}` |")
        if not package["functions"]:
            lines.append("| — | No public entry points detected. |")
        lines += ["", "#### Public types", "", "| Type | Encoding source |", "|---|---|"]
        for type_name in package["types"]:
            lines.append(f"| `{type_name}` | `#[contracttype]` or public Rust type in `contracts/{name}/src/lib.rs` |")
        if not package["types"]:
            lines.append("| — | No public types detected. |")
        lines += ["", "#### Event topics", "", "| Topic | Source |", "|---|---|"]
        for event in package["events"]:
            lines.append(f"| `{event}` | `env.events().publish` in `contracts/{name}/src/lib.rs` |")
        if not package["events"]:
            lines.append("| — | No inline `symbol_short!` event topics detected. |")
        lines.append("")
    lines += [
        "## Escrow release security notes",
        "",
        "The `escrow` contract exposes `release(tree_id)` and `batch_release(tree_ids)`. Both require authorization from the configured verifier before any state transition. `batch_release` validates a non-empty list of at most 64 IDs and reverts atomically if any item is missing, already settled, or otherwise invalid. This reduces timing and ordering exposure for relayers without granting any new release authority to observers of the transaction pool.",
        "",
        "## Regeneration",
        "",
        "Run `python3 scripts/generate-contract-interface-docs.py` after changing a contract entry point, public type, or inline event topic.",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(render(), encoding="utf-8")
    print(OUT)
