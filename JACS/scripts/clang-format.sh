#!/usr/bin/env bash

set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR/.."

SOURCE_DIRS="src inc tests"
check_only=false

for arg in "$@"; do
    case "$arg" in
        -c|--check)
            check_only=true
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: $0 [-c|--check]"
            exit 1
            ;;
    esac
done

CLANG_FORMAT=""
for candidate in clang-format clang-format-20 clang-format-19 clang-format-18 clang-format-17 clang-format-16; do
    if command -v "$candidate" >/dev/null 2>&1; then
        CLANG_FORMAT="$candidate"
        break
    fi
done

if [ -z "$CLANG_FORMAT" ]; then
    echo "clang-format not found. Please install clang-format."
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

mapfile -t files < <(find "${existing_dirs[@]}" \( -name '*.cpp' -o -name '*.cppm' -o -name '*.h' -o -name '*.hpp' \))

if [ ${#files[@]} -eq 0 ]; then
    echo "No source files found."
    exit 0
fi

if $check_only; then
    "$CLANG_FORMAT" --dry-run --Werror "${files[@]}"
else
    "$CLANG_FORMAT" -i "${files[@]}"
    echo "Formatted ${#files[@]} file(s)."
fi
