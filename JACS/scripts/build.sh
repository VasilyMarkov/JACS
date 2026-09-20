#!/usr/bin/env bash

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
        -j|--jobs)
            shift
            jobs="$1"
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [-cb|--clean_build] [-d|--debug] [-j|--jobs N]"
            exit 1
            ;;
    esac
    shift
done

if $clean_build; then
    rm -rf "build/$preset"
fi

cmake --preset "$preset"
cmake --build --preset "$preset" -j "$jobs"