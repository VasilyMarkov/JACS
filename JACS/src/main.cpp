// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vasily Markov

#include <print>
#include <vector>
#include <optional>
#include <unordered_set>
#include <unordered_map>
#include <memory>
#include <iostream>
#include <Eigen/Dense>
 
using Eigen::MatrixXd;

enum class node_id: uint32_t {};
enum class branch_id: uint32_t {};

enum class matrix_type: uint8_t{ G, C, B, D };

constexpr node_id k_ground{};

struct Resistor  { node_id a, b; double r; };
struct Vsource   { node_id a, b; double v; branch_id k; };
struct Isource   { node_id a, b; double i; branch_id k; };

class NetList {
public:
    node_id node(std::string_view name) {}

    void add(Resistor resistor) {
        std::get<std::vector<Resistor>>(g_elements_).push_back(std::move(resistor));
    }

    size_t getGMartixSize() const {
        size_t g_size{};
        std::apply([&](const auto& vector) { g_size += vector.size(); }, g_elements_);
        return g_size;
    }

private:
    std::tuple<std::vector<Resistor>> g_elements_;
    std::vector<Vsource> v_sources_;
};


class MNASystem {
public:
    MNASystem(const NetList& netlist): netlist_(netlist) {
        const size_t g_size = netlist.getGMartixSize();
        stamp_matrix_.resize(g_size, g_size);
        std::cout << stamp_matrix_ << std::endl;
    }

    void addAdmittance(node_id a, node_id b, double y) {}

    void stamp(const Resistor& resistor) {
        addAdmittance(resistor.a, resistor.b, 1.0 / resistor.r);
    }

private:
    const NetList& netlist_;
    MatrixXd stamp_matrix_;
};

void stamp(const Resistor& resistor, MNASystem& mna) {
    mna.addAdmittance(resistor.a, resistor.b, 1.0 / resistor.r);
}

int main() {
    NetList netlist;
    Resistor res = {.a = node_id(1), .b = node_id(2), .r = 1000};
    netlist.add(std::move(res));
    netlist.add(Resistor{.a = node_id(2), .b = node_id(3), .r = 500});
    MNASystem mna(netlist);
}