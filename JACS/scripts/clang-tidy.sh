#!/usr/bin/env bash

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Vasily Markov

set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR/.."

SOURCE_DIRS="src inc tests"
preset=release
fix=false

while [ $# -gt 0 ]; do
    case "$1" in
        -d|--debug)
            preset=debug
            ;;
        -f|--fix)
            fix=true
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [-d|--debug] [-f|--fix]"
            exit 1
            ;;
    esac
    shift
done

CLANG_TIDY=""
for candidate in clang-tidy clang-tidy-20 clang-tidy-19 clang-tidy-18 clang-tidy-17 clang-tidy-16; do
    if command -v "$candidate" >/dev/null 2>&1; then
        CLANG_TIDY="$candidate"
        break
    fi
done

if [ -z "$CLANG_TIDY" ]; then
    echo "clang-tidy not found. Please install clang-tidy."
    exit 1
fi

existing_dirs=()
for dir in $SOURCE_DIRS; do
    [ -d "$dir" ] && existing_dirs+=("$dir")
done

if [ ${#existing_dirs[@]} -eq 0 ]; then
    echo "No source directories found."
    exit 0
fi

# Headers are analyzed through the translation units that include them, so only
# .cpp/.cppm files are passed in.
mapfile -t files < <(find "${existing_dirs[@]}" \( -name '*.cpp' -o -name '*.cppm' \))

if [ ${#files[@]} -eq 0 ]; then
    echo "No source files found."
    exit 0
fi

# clang-tidy needs the compile database of the chosen preset.
BUILD_DIR="build/$preset"
if [ ! -f "$BUILD_DIR/compile_commands.json" ]; then
    cmake --preset "$preset"
fi

# Report diagnostics from this project's headers, but not from Eigen or the
# standard library.
header_filter="^$PWD/($(echo "${existing_dirs[@]}" | tr ' ' '|'))/"

args=(-p "$BUILD_DIR" --quiet --header-filter="$header_filter")
if $fix; then
    args+=(--fix)
fi

status=0
for file in "${files[@]}"; do
    echo "clang-tidy: $file"
    "$CLANG_TIDY" "${args[@]}" "$file" || status=1
done

exit $status
