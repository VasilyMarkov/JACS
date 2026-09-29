#!/usr/bin/env bash

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Vasily Markov

set -e

jobs=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
preset=release
clean_build=false

while [ $# -gt 0 ]; do
    case "$1" in
        -cb|--clean_build)
            clean_build=true
            ;;
        -d|--debug)
            preset=debug
            ;;
        -w|--wasm)
            preset=wasm
            ;;
        -j|--jobs)
            shift
            jobs="$1"
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [-cb|--clean_build] [-d|--debug] [-w|--wasm] [-j|--jobs N]"
            exit 1
            ;;
    esac
    shift
done

# The wasm preset needs the Emscripten environment. Use the active one, or fall
# back to an emsdk checkout in $EMSDK_HOME (default ~/emsdk).
if [ "$preset" = wasm ] && [ -z "${EMSDK:-}" ]; then
    emsdk_home="${EMSDK_HOME:-$HOME/emsdk}"
    if [ ! -f "$emsdk_home/emsdk_env.sh" ]; then
        echo "Emscripten SDK not found in $emsdk_home. Install it or set EMSDK_HOME."
        exit 1
    fi
    # shellcheck disable=SC1091
    source "$emsdk_home/emsdk_env.sh" > /dev/null
fi

if $clean_build; then
    rm -rf "build/$preset"
fi

cmake --preset "$preset"
cmake --build --preset "$preset" -j "$jobs"