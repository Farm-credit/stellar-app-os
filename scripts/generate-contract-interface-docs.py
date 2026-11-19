#!/usr/bin/env python3
"""Generate an OpenAPI-style inventory for the Rust Soroban contracts."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts"
OUT = ROOT / "docs" / "contracts" / "interface.md"

NATSPEC_TAGS = ("notice", "dev", "param", "return", "custom:error", "custom:event")


def clean_type(value: str) -> str:
    value = re.sub(r"\s+", " ", value.strip())
    return value.replace("&", "")


def parse_natspec(comment_lines: list[str]) -> dict:
    """Parse a block of Solidity NatSpec comment lines into structured tags."""
    doc: dict = {
        "notice": [],
        "dev": [],
        "params": [],
        "returns": [],
        "errors": [],
        "events": [],
    }
    for raw in comment_lines:
        line = raw.strip()
        if line.startswith("///"):
            line = line[3:].strip()
        elif line.startswith("/**") or line.startswith("*/"):
            line = line.lstrip("/").lstrip("*").rstrip("/").strip()
        elif line.startswith("*"):
            line = line[1:].strip()
        if not line:
            continue
        tag_match = re.match(r"@(\S+)\s*(.*)", line)
        if not tag_match:
            if doc["notice"]:
                doc["notice"].append(line)
            elif doc["dev"]:
                doc["dev"].append(line)
            continue
        tag, rest = tag_match.group(1), tag_match.group(2).strip()
        if tag == "notice":
            doc["notice"].append(rest)
        elif tag == "dev":
            doc["dev"].append(rest)
        elif tag == "param":
            parts = rest.split(None, 1)
            name = parts[0] if parts else ""
            desc = parts[1] if len(parts) > 1 else ""
            doc["params"].append((name, desc))
        elif tag == "return":
            parts = rest.split(None, 1)
            if len(parts) > 1 and re.match(r"^\w+$", parts[0]):
                doc["returns"].append((parts[0], parts[1]))
            else:
                doc["returns"].append(("", rest))
        elif tag == "custom:error":
            parts = rest.split(None, 1)
            name = parts[0] if parts else ""
            desc = parts[1] if len(parts) > 1 else ""
            doc["errors"].append((name, desc))
        elif tag == "custom:event":
            parts = rest.split(None, 1)
            name = parts[0] if parts else ""
            desc = parts[1] if len(parts) > 1 else ""
            doc["events"].append((name, desc))
    return doc


def parse_solidity(path: Path) -> dict:
    """Parse public/external Solidity functions and their NatSpec documentation."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    functions: list[dict] = []
    pending: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith("///") or stripped.startswith("/**") or stripped.startswith("*"):
            pending.append(line)
            if stripped.startswith("/**") and "*/" not in stripped:
                i += 1
                while i < len(lines):
                    pending.append(lines[i])
                    if "*/" in lines[i]:
                        break
                    i += 1
            i += 1
            continue
        if stripped.startswith("//"):
            i += 1
            continue
        fn_match = re.match(r"\s*function\s+(\w+)\s*\(", line)
        if fn_match:
            signature = stripped
            while "{" not in signature and ";" not in signature and i + 1 < len(lines):
                i += 1
                signature += " " + lines[i].strip()
            signature = re.split(r"[{;]", signature)[0].strip()
            signature = re.sub(r"\s+", " ", signature)
            visibility = re.search(r"\b(public|external)\b", signature)
            if visibility:
                doc = parse_natspec(pending)
                functions.append(
                    {
                        "name": fn_match.group(1),
                        "signature": signature,
                        "doc": doc,
                    }
                )
            pending = []
            i += 1
            continue
        if stripped:
            pending = []
        i += 1
    return {"functions": functions}


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


def render_solidity_section(name: str, package: dict, source: Path) -> list[str]:
    rel = source.relative_to(ROOT)
    lines = [f"### `{name}`", "", f"Source: `{rel}`", ""]
    lines += ["#### Functions", ""]
    if not package["functions"]:
        lines += ["No public or external functions detected.", ""]
        return lines
    for fn in package["functions"]:
        doc = fn["doc"]
        lines += [f"##### `{fn['name']}`", "", f"`{fn['signature']}`", ""]
        if doc["notice"]:
            lines += ["**Notice:** " + " ".join(doc["notice"]), ""]
        if doc["dev"]:
            lines += ["**Developer notes:** " + " ".join(doc["dev"]), ""]
        lines += ["| Field | Documentation |", "|---|---|"]
        if doc["params"]:
            for param, desc in doc["params"]:
                lines.append(f"| `@param {param}` | {desc or '—'} |")
        else:
            lines.append("| Parameters | No `@param` documentation. |")
        if doc["returns"]:
            for ret_name, desc in doc["returns"]:
                label = f"@return {ret_name}".strip()
                lines.append(f"| `{label}` | {desc or '—'} |")
        else:
            lines.append("| Returns | No `@return` documentation. |")
        if doc["errors"]:
            for err_name, desc in doc["errors"]:
                lines.append(f"| `@custom:error {err_name}` | {desc or '—'} |")
        if doc["events"]:
            for ev_name, desc in doc["events"]:
                lines.append(f"| `@custom:event {ev_name}` | {desc or '—'} |")
        lines.append("")
    return lines


def render() -> str:
    packages = []
    for source in sorted(CONTRACTS.glob("*/src/lib.rs")):
        package = parse_package(source)
        if package["functions"] or package["types"] or package["events"]:
            packages.append((source.parent.parent.name, package))
    solidity_sources = sorted(CONTRACTS.glob("*.sol")) + sorted(CONTRACTS.glob("solidity/*.sol"))
    solidity_packages = []
    for source in solidity_sources:
        package = parse_solidity(source)
        if package["functions"]:
            solidity_packages.append((source.stem, package, source))
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
    if solidity_packages:
        lines += [
            "## Solidity contract interfaces",
            "",
            "> Solidity entry points are documented from their NatSpec comments (`@notice`, `@dev`, `@param`, `@return`, `@custom:error`, `@custom:event`).",
            "",
        ]
        for name, package, source in solidity_packages:
            lines += render_solidity_section(name, package, source)
    lines += [
        "## Escrow release security notes",
        "",
        "The `escrow` contract exposes `release(tree_id)` and `batch_release(tree_ids)`. Both require authorization from the configured verifier before any state transition. `batch_release` validates a non-empty list of at most 64 IDs and reverts atomically if any item is missing, already settled, or otherwise invalid. This reduces timing and ordering exposure for relayers without granting any new release authority to observers of the transaction pool.",
        "",
        "## Regeneration",
        "",
        "Run `python3 scripts/generate-contract-interface-docs.py` after changing a contract entry point, public type, inline event topic, or Solidity NatSpec comment.",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(render(), encoding="utf-8")
    print(OUT)
