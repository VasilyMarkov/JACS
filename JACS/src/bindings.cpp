// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vasily Markov

#include "schematic.hpp"

#include <emscripten/bind.h>

// The whole WebAssembly surface is one JSON-in/JSON-out function, so the JavaScript side has a
// single stable ABI and never touches C++ object lifetimes.
EMSCRIPTEN_BINDINGS(jacs) {
    emscripten::function("run", &jacs::run);
}
