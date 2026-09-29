#!/usr/bin/env bash

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Vasily Markov

set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BUILD_DIR="$SCRIPT_DIR/../build"

preset=release

# With no arguments, solve the bundled example instead of waiting for a request on stdin.
args=("$@")
if [ ${#args[@]} -eq 0 ]; then
    args=("$SCRIPT_DIR/../examples/divider.json")
fi
case_file=""

"$BUILD_DIR/$preset/jacs" "${args[@]}"

