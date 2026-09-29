# JACS (Just Another Circuit Simulator)

A small C++23 circuit simulator. It is at an early stage: it currently computes the **DC operating point of linear resistive circuits** using Modified Nodal Analysis (MNA).

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

### Conventions

- Node `0` is ground. Nodes `1..N` are unknowns, so ids should be contiguous.
- For `Vsource`, `a` is the positive terminal: `V(a) − V(b) = v`.
- `k` is the source's branch index. The caller sets it, and it should be unique and run from `0` to one less than the number of voltage sources. It selects the row and column of the source's current in `x`. Nothing validates it yet.
- A branch current is the current flowing into the source through terminal `a`. It is negative for a source that delivers power.

### Example

The demo in [JACS/src/main.cpp](JACS/src/main.cpp) solves a 5 V source driving three resistors in series (1 kΩ, 500 Ω and 100 Ω):

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

It prints the matrix `A`, the vector `z` and the solution `x`:

```
 0.001 -0.001      0     -1
-0.001  0.003 -0.002      0
     0 -0.002  0.012      0
    -1      0      0      0
0
0
0
5
       -5        # V(1)
   -1.875        # V(2)
  -0.3125        # V(3)
-0.003125        # current through the voltage source (A)
```

The node voltages are negative because the source's positive terminal `a` is ground.

## Not yet supported

- Current sources (`Isource` is declared but not yet part of `NetList` or stamped), capacitors and inductors.
- Nonlinear devices, AC analysis and transient analysis.
- Reading circuits from a netlist file. The demo circuit is hard-coded in `main`.
- Error reporting in the demo: `main` currently catches and discards exceptions, so a singular circuit produces no message.

## Building and running

Requirements: CMake ≥ 3.30, Ninja, and Clang with libc++ and lld. The presets in [JACS/CMakePresets.json](JACS/CMakePresets.json) point at `/usr/bin/clang++`. The [.devcontainer](.devcontainer) image provides the full toolchain (LLVM 20). [Eigen](https://eigen.tuxfamily.org) 5.0.1 is downloaded automatically by CMake on the first configure, which needs network access.

From the `JACS` directory:

```sh
./scripts/build.sh        # release build (default)
./scripts/build.sh -d     # debug build with AddressSanitizer and UndefinedBehaviorSanitizer
./scripts/build.sh -cb    # clean build
./scripts/run.sh          # run the release binary
./scripts/clang-format.sh # format sources (add -c to only check)
./scripts/clang-tidy.sh   # static analysis (add -d for the debug preset, -f to apply fixes)
```

`clang-tidy.sh` uses the compile database of the chosen preset, configuring it first if needed, and the checks in [.clang-tidy](.clang-tidy).

## License

MIT — see [LICENSE](LICENSE).
