// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vasily Markov

#pragma once

#include <string>

namespace jacs {

// Runs one analysis and returns the JSON response. This is the single entry point shared by the
// native CLI and the WebAssembly bindings, so both speak exactly the same protocol.
//
// Request:
//   {
//     "analysis": "op",
//     "schematic": {
//       "components": [{"id": "R1", "type": "resistor" | "vsource", "value": 1000,
//                       "a": {"x": 0, "y": 0}, "b": {"x": 4, "y": 0}}],
//       "wires":      [{"a": {"x": 0, "y": 0}, "b": {"x": 0, "y": 3}}],
//       "grounds":    [{"x": 0, "y": 3}]
//     }
//   }
//
// Pins, wire ends and grounds live on an integer grid. A wire must be axis-aligned and connects
// every pin, wire end and ground that lies on it. Terminal `a` of a voltage source is its positive
// terminal, and every current is measured flowing from `a` to `b` through the component.
//
// The response is always a JSON object with an "ok" flag. On failure it is {"ok": false, "error":
// "..."}; this function never throws.
std::string run(const std::string& request_json);

} // namespace jacs
