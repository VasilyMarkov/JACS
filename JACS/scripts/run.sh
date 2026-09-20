#!/usr/bin/env bash

set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BUILD_DIR="$SCRIPT_DIR/../build"

preset=release

args=()
case_file=""

"$BUILD_DIR/$preset/jacs" "${args[@]}"

