// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vasily Markov

#include "schematic.hpp"

#include "mna.hpp"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <functional>
#include <nlohmann/json.hpp>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace jacs {
namespace {

using json = nlohmann::json;

constexpr int64_t k_max_coordinate = 1'000'000;

// A problem with the circuit itself, as opposed to a malformed request.
class CircuitError : public std::runtime_error {
public:
    using std::runtime_error::runtime_error;
};

struct Point {
    int x{};
    int y{};
    bool operator==(const Point&) const = default;
};

struct PointHash {
    size_t operator()(const Point& p) const noexcept {
        const uint64_t packed =
            (uint64_t{static_cast<uint32_t>(p.x)} << 32) | static_cast<uint32_t>(p.y);
        return std::hash<uint64_t>{}(packed);
    }
};

struct Wire {
    Point a, b;
};

enum class Kind : uint8_t {
    resistor,
    vsource
};

struct RawComponent {
    std::string id;
    Kind kind;
    double value;
    Point a, b;
};

struct ComponentInfo {
    std::string id;
    Kind kind;
    node_id a, b;
    double value;
    branch_id branch; // meaningful for voltage sources only
};

// The electrical view of a schematic: numbered nodes instead of grid points.
struct Circuit {
    std::vector<ComponentInfo> components;
    std::vector<int> wire_nodes; // node of each wire, -1 when it touches no component or ground
    size_t num_nodes{};          // excluding ground
    size_t num_branches{};
};

class DisjointSets {
public:
    size_t add() {
        parent_.push_back(parent_.size());
        return parent_.size() - 1;
    }

    size_t find(size_t i) {
        while (parent_[i] != i) {
            parent_[i] = parent_[parent_[i]];
            i = parent_[i];
        }
        return i;
    }

    void unite(size_t a, size_t b) { parent_[find(a)] = find(b); }

private:
    std::vector<size_t> parent_;
};

int parseCoordinate(const json& j) {
    if (!j.is_number_integer()) {
        throw CircuitError("coordinates must be integers");
    }
    const auto value = j.get<int64_t>();
    if (value > k_max_coordinate || value < -k_max_coordinate) {
        throw CircuitError("coordinate out of range");
    }
    return static_cast<int>(value);
}

Point parsePoint(const json& j) {
    return {.x = parseCoordinate(j.at("x")), .y = parseCoordinate(j.at("y"))};
}

double parseValue(const json& j) {
    const auto value = j.get<double>();
    if (!std::isfinite(value)) {
        throw CircuitError("values must be finite numbers");
    }
    return value;
}

Kind parseKind(const std::string& type) {
    if (type == "resistor") {
        return Kind::resistor;
    }
    if (type == "vsource") {
        return Kind::vsource;
    }
    throw CircuitError("unknown component type '" + type + "'");
}

// Wires are axis-aligned, so a point is on a wire when it sits inside its bounding box.
bool liesOn(const Wire& wire, Point p) {
    return std::min(wire.a.x, wire.b.x) <= p.x && p.x <= std::max(wire.a.x, wire.b.x) &&
           std::min(wire.a.y, wire.b.y) <= p.y && p.y <= std::max(wire.a.y, wire.b.y);
}

Circuit extractCircuit(const json& schematic) {
    std::vector<RawComponent> raw;
    std::unordered_set<std::string> ids;
    for (const auto& j : schematic.at("components")) {
        RawComponent c{.id = j.at("id").get<std::string>(),
                       .kind = parseKind(j.at("type").get<std::string>()),
                       .value = parseValue(j.at("value")),
                       .a = parsePoint(j.at("a")),
                       .b = parsePoint(j.at("b"))};
        if (!ids.insert(c.id).second) {
            throw CircuitError("duplicate component id '" + c.id + "'");
        }
        if (c.kind == Kind::resistor && c.value <= 0.0) {
            throw CircuitError(c.id + ": resistance must be positive");
        }
        raw.push_back(std::move(c));
    }

    std::vector<Wire> wires;
    for (const auto& j : schematic.at("wires")) {
        const Wire wire{.a = parsePoint(j.at("a")), .b = parsePoint(j.at("b"))};
        if (wire.a.x != wire.b.x && wire.a.y != wire.b.y) {
            throw CircuitError("wires must be horizontal or vertical");
        }
        wires.push_back(wire);
    }

    std::vector<Point> grounds;
    for (const auto& j : schematic.at("grounds")) {
        grounds.push_back(parsePoint(j));
    }

    // Every pin, wire end and ground is a grid point. A wire joins all points lying on it, which
    // makes T-junctions work while two wires that merely cross stay separate.
    std::vector<Point> points;
    std::unordered_map<Point, size_t, PointHash> point_index;
    DisjointSets sets;
    auto indexOf = [&](Point p) {
        const auto [it, inserted] = point_index.try_emplace(p, points.size());
        if (inserted) {
            points.push_back(p);
            sets.add();
        }
        return it->second;
    };

    for (const auto& c : raw) {
        indexOf(c.a);
        indexOf(c.b);
    }
    for (const auto& w : wires) {
        indexOf(w.a);
        indexOf(w.b);
    }
    for (const auto& g : grounds) {
        indexOf(g);
    }
    for (const auto& w : wires) {
        const size_t anchor = indexOf(w.a);
        for (size_t i = 0; i < points.size(); ++i) {
            if (liesOn(w, points[i])) {
                sets.unite(anchor, i);
            }
        }
    }
    // All ground symbols are the same net.
    for (const auto& g : grounds) {
        sets.unite(indexOf(grounds.front()), indexOf(g));
    }

    if (grounds.empty() && !raw.empty()) {
        throw CircuitError("no ground: add a ground symbol");
    }

    std::unordered_map<size_t, size_t> node_of_set;
    if (!grounds.empty()) {
        node_of_set.emplace(sets.find(indexOf(grounds.front())), 0);
    }
    size_t next_node = 1;
    auto nodeOf = [&](Point p) {
        const auto [it, inserted] = node_of_set.try_emplace(sets.find(indexOf(p)), next_node);
        if (inserted) {
            ++next_node;
        }
        return it->second;
    };

    Circuit circuit;
    for (const auto& c : raw) {
        ComponentInfo info{.id = c.id,
                           .kind = c.kind,
                           .a = node_id(nodeOf(c.a)),
                           .b = node_id(nodeOf(c.b)),
                           .value = c.value,
                           .branch = {}};
        if (c.kind == Kind::vsource) {
            info.branch = branch_id(circuit.num_branches++);
        }
        circuit.components.push_back(std::move(info));
    }
    circuit.num_nodes = next_node - 1;

    for (const auto& w : wires) {
        const auto it = node_of_set.find(sets.find(indexOf(w.a)));
        circuit.wire_nodes.push_back(it == node_of_set.end() ? -1 : static_cast<int>(it->second));
    }
    return circuit;
}

struct Solution {
    std::vector<double> voltages;        // indexed by node id, [0] is ground
    std::vector<double> branch_currents; // indexed by branch id, flowing a -> b through the source
};

NetList makeNetlist(const Circuit& circuit) {
    NetList netlist;
    for (const ComponentInfo& c : circuit.components) {
        switch (c.kind) {
            case Kind::resistor: netlist.add(Resistor{.a = c.a, .b = c.b, .r = c.value}); break;
            case Kind::vsource:
                netlist.add(Vsource{.a = c.a, .b = c.b, .v = c.value, .k = c.branch});
                break;
        }
    }
    return netlist;
}

Solution solve(const Circuit& circuit) {
    Solution solution;
    solution.voltages.assign(circuit.num_nodes + 1, 0.0);
    solution.branch_currents.assign(circuit.num_branches, 0.0);
    if (circuit.num_nodes + circuit.num_branches == 0) {
        return solution; // everything is tied to ground
    }

    const NetList netlist = makeNetlist(circuit);
    MNASystem mna(netlist);
    mna.stamp();
    const VectorXd x = mna.solve();

    const auto at = [&x](size_t i) { return x(static_cast<Eigen::Index>(i)); };
    for (size_t n = 1; n <= circuit.num_nodes; ++n) {
        solution.voltages[n] = at(n - 1);
    }
    for (size_t k = 0; k < circuit.num_branches; ++k) {
        solution.branch_currents[k] = at(circuit.num_nodes + k);
    }
    return solution;
}

struct ComponentState {
    double voltage; // a relative to b
    double current; // a -> b
    double power;   // absorbed; negative when the component delivers energy
};

ComponentState componentState(const ComponentInfo& c, const Solution& solution) {
    const double voltage =
        solution.voltages[std::to_underlying(c.a)] - solution.voltages[std::to_underlying(c.b)];
    const double current = c.kind == Kind::resistor
                               ? voltage / c.value
                               : solution.branch_currents[std::to_underlying(c.branch)];
    return {.voltage = voltage, .current = current, .power = voltage * current};
}

json operatingPoint(const Circuit& circuit) {
    const Solution solution = solve(circuit);
    json components = json::array();
    for (const auto& c : circuit.components) {
        const ComponentState state = componentState(c, solution);
        components.push_back({{"id", c.id},
                              {"nodeA", std::to_underlying(c.a)},
                              {"nodeB", std::to_underlying(c.b)},
                              {"voltage", state.voltage},
                              {"current", state.current},
                              {"power", state.power}});
    }
    return {{"ok", true},
            {"analysis", "op"},
            {"nodeVoltages", solution.voltages},
            {"components", components},
            {"wires", circuit.wire_nodes}};
}

std::string dump(const json& response) {
    return response.dump(-1, ' ', false, json::error_handler_t::replace);
}

std::string errorResponse(const std::string& message) {
    return dump({{"ok", false}, {"error", message}});
}

} // namespace

std::string run(const std::string& request_json) {
    try {
        const json request = json::parse(request_json);
        const Circuit circuit = extractCircuit(request.at("schematic"));
        const auto analysis = request.at("analysis").get<std::string>();
        if (analysis == "op") {
            return dump(operatingPoint(circuit));
        }
        throw CircuitError("unknown analysis '" + analysis + "'");
    } catch (const CircuitError& e) {
        return errorResponse(e.what());
    } catch (const json::exception& e) {
        return errorResponse(std::string("malformed request: ") + e.what());
    } catch (const std::exception& e) {
        return errorResponse(e.what());
    }
}

} // namespace jacs
