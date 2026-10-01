# JACS (Just Another Circuit Simulator)

A small C++23 circuit simulator. It is at an early stage: it currently computes the **DC operating point of linear resistive circuits** using Modified Nodal Analysis (MNA). It can be used from the command line, or in the browser through a schematic editor where the same C++ code runs as WebAssembly.

## Current functionality

- **Circuit elements**
  - Resistor (`Resistor{a, b, r}`)
  - Independent voltage source (`Vsource{a, b, v, k}`)
- **Netlist** (`NetList`): circuits are built in code by adding elements. The number of nodes is derived from the highest node id used.
- **MNA system** (`MNASystem`): stamps every element into the system `A·x = z`, where
  - `A = [G B; Bᵀ D]` — `G` holds resistor conductances, `B` ties voltage-source branches to their nodes, and `D` is zero,
  - `x = [node voltages; voltage-source branch currents]`,
  - `z = [0; source voltages]`.
- **Solver**: the system is solved by LU factorization with full pivoting (Eigen `FullPivLU`). A singular matrix, such as a floating node or a loop of voltage sources, raises `std::runtime_error`.

- **Schematic layer** (`jacs::run` in [JACS/src/schematic.hpp](JACS/src/schematic.hpp)): takes a JSON request and returns a JSON response, so the command line and the WebAssembly module share one protocol. A schematic places parts, wires and grounds on an integer grid; the layer derives the nodes from that connectivity, numbers the nodes and voltage-source branches, and solves. The one analysis is `op`, the DC operating point.
- **Web UI** ([JACS/web](JACS/web)): a strict-TypeScript app with a Canvas 2D schematic editor and the WebAssembly simulator running in a Web Worker.

### Conventions

- Node `0` is ground. Nodes `1..N` are unknowns, so ids should be contiguous.
- For `Vsource`, `a` is the positive terminal: `V(a) − V(b) = v`.
- `k` is the source's branch index. The caller sets it, and it should be unique and run from `0` to one less than the number of voltage sources. It selects the row and column of the source's current in `x`. Nothing validates it yet.
- A branch current is the current flowing into the source through terminal `a`. It is negative for a source that delivers power.
- In the schematic layer, ids are assigned for you: nodes are numbered in the order parts reference them (ground is `0`) and branch ids follow the order of the voltage sources. A wire connects every pin, wire end and ground that lies on it, so two wires that only cross stay separate. Every current is reported flowing from terminal `a` to terminal `b`.

### Example

`NetList` and `MNASystem` can be used directly. This solves a 5 V source driving three resistors in series (1 kΩ, 500 Ω and 100 Ω):

```cpp
NetList netlist;
netlist.add(Resistor{.a = node_id(1), .b = node_id(2), .r = 1000});
netlist.add(Resistor{.a = node_id(2), .b = node_id(3), .r = 500});
netlist.add(Resistor{.a = node_id(3), .b = node_id(0), .r = 100});
netlist.add(Vsource{.a = node_id(0), .b = node_id(1), .v = 5, .k = branch_id(0)});
MNASystem mna(netlist);
mna.stamp();
auto answer = mna.solve();
```

`answer` is `x = [-5, -1.875, -0.3125, -0.003125]`: three node voltages and the source current in amperes. The node voltages are negative because the source's positive terminal `a` is ground.

### Command line

`jacs` reads one request from a file (or from stdin), prints the JSON response and exits with 1 if the analysis failed. [JACS/examples/divider.json](JACS/examples/divider.json) is the same divider drawn on a grid:

```sh
./build/release/jacs examples/divider.json
```

```json
{"analysis":"op","components":[{"current":-0.003125,"id":"V1","nodeA":1,"nodeB":0,"power":-0.015625,"voltage":5.0}, ...],"nodeVoltages":[0.0,5.0,1.875,0.3125],"ok":true,"wires":[1,1,2,0,0]}
```

Circuit problems, such as a missing ground or a floating island of parts, come back as `{"ok": false, "error": "..."}`. The request format is documented in [JACS/src/schematic.hpp](JACS/src/schematic.hpp).

## Not yet supported

- Current sources (`Isource` is declared but not yet part of `NetList` or stamped), capacitors and inductors.
- Nonlinear devices, AC analysis and transient analysis.
- Reading SPICE netlists. Circuits are loaded from JSON schematics.
- In the editor, moving a part does not drag the wires attached to it, and only one element can be selected at a time.

## Building and running

Requirements: CMake ≥ 3.30, Ninja, and Clang with libc++ and lld. The presets in [JACS/CMakePresets.json](JACS/CMakePresets.json) point at `/usr/bin/clang++`. The [.devcontainer](.devcontainer) image provides the full toolchain (LLVM 20). [Eigen](https://eigen.tuxfamily.org) 5.0.1 is downloaded automatically by CMake on the first configure, which needs network access.

From the `JACS` directory:

```sh
./scripts/build.sh        # release build (default)
./scripts/build.sh -d     # debug build with AddressSanitizer and UndefinedBehaviorSanitizer
./scripts/build.sh -cb    # clean build
./scripts/run.sh          # run the release binary (on examples/divider.json, or the request file you pass)
./scripts/clang-format.sh # format sources (add -c to only check)
./scripts/clang-tidy.sh   # static analysis (add -d for the debug preset, -f to apply fixes)
```

`clang-tidy.sh` uses the compile database of the chosen preset, configuring it first if needed, and the checks in [.clang-tidy](.clang-tidy). Files that the preset does not build (`bindings.cpp` is wasm-only) are skipped.

### Web UI

Additional requirements: the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) and Node.js 20.19+ or 22.12+. The [.devcontainer](.devcontainer) image has both: Node.js 22 from NodeSource, and the SDK in `/opt/emsdk`, which every interactive shell activates. In the devcontainer, skip the setup below and start at `./scripts/build.sh -w`. Dependencies are downloaded on first use, which needs network access.

```sh
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
~/emsdk/emsdk install latest && ~/emsdk/emsdk activate latest
source ~/emsdk/emsdk_env.sh   # puts emcc on PATH (and the SDK's Node); repeat in every new shell

./scripts/build.sh -w     # compile the simulator to WebAssembly (uses $EMSDK, else ~/emsdk or $EMSDK_HOME)
cd web
npm install
npm run dev               # editor at http://127.0.0.1:5173
```

`build.sh -w` writes `web/src/wasm/jacs.js`, `jacs.wasm` and `jacs.d.ts`. These are generated and git-ignored, and the TypeScript declarations come straight from the Embind bindings in [JACS/src/bindings.cpp](JACS/src/bindings.cpp). The module exposes a single function, `run(json) -> json`.

| Command | What it does |
| --- | --- |
| `npm run typecheck` | strict `tsc` over the app, the worker and the tests |
| `npm test` | Vitest, including tests that run the real WebAssembly module |
| `npm run build` | typecheck, then a production bundle in `web/dist` |

In the editor: `1`–`5` pick a tool (select, wire, resistor, source, ground), `R` rotates, `Del` deletes, `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo, the wheel zooms, and middle-drag or Space-drag pans. Values accept engineering notation such as `4.7k`, `2.2u` or `1Meg`. The document autosaves to the browser and can be exported and imported as JSON.

## License

MIT — see [LICENSE](LICENSE).
