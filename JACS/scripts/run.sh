#!/usr/bin/env bash

# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Vasily Markov

set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BUILD_DIR="$SCRIPT_DIR/../build"

preset=release

args=()
case_file=""

"$BUILD_DIR/$preset/jacs" "${args[@]}"

