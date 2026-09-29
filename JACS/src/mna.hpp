// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vasily Markov

#pragma once

#include <Eigen/Dense>
#include <algorithm>
#include <cstdint>
#include <memory>
#include <optional>
#include <stdexcept>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

using Eigen::MatrixXd;
using Eigen::VectorXd;

enum class node_id : size_t {
};
enum class branch_id : size_t {
};

enum class matrix_type : uint8_t {
    G,
    C,
    B,
    D
};

constexpr node_id k_ground{};

struct Resistor {
    node_id a, b;
    double r;
};
struct Vsource {
    node_id a, b;
    double v;
    branch_id k;
};
struct Isource {
    node_id a, b;
    double i;
    branch_id k;
};

inline bool isGround(node_id id) {
    return id == k_ground;
}

class NetList {
public:
    void add(Resistor resistor) {
        trackNodes(resistor.a, resistor.b);
        resistors_.push_back(std::move(resistor));
    }

    void add(Vsource v_source) {
        trackNodes(v_source.a, v_source.b);
        v_sources_.push_back(std::move(v_source));
    }

    const std::vector<Resistor>& getResistors() const { return resistors_; }
    const std::vector<Vsource>& getVoltageSources() const { return v_sources_; }

    size_t getNumNodes() const { return num_nodes_; }

private:
    void trackNodes(node_id a, node_id b) {
        num_nodes_ = std::max({std::to_underlying(a), std::to_underlying(b), num_nodes_});
    }

    size_t num_nodes_{};
    std::vector<Resistor> resistors_;
    std::vector<Vsource> v_sources_;
};

class MNASystem {
public:
    MNASystem(const NetList& netlist) : num_nodes_(netlist.getNumNodes()), netlist_(netlist) {
        const size_t n_branches = netlist.getVoltageSources().size();
        const size_t size = num_nodes_ + n_branches;
        a_matrix_.setZero(size, size);
        z_vector_.setZero(size);
    }

    void addAdmittance(node_id a, node_id b, double g) {
        auto a_idx = nodeIndex(a);
        auto b_idx = nodeIndex(b);
        if (!isGround(a)) {
            a_matrix_(a_idx, a_idx) += g;
        }
        if (!isGround(b)) {
            a_matrix_(b_idx, b_idx) += g;
        }
        if (!isGround(a) && !isGround(b)) {
            a_matrix_(a_idx, b_idx) -= g;
            a_matrix_(b_idx, a_idx) -= g;
        }
    }

    void addVoltage(node_id a, node_id b, branch_id k, double v) {
        auto a_idx = nodeIndex(a);
        auto b_idx = nodeIndex(b);
        auto k_idx = branchIndex(k);
        if (!isGround(a)) {
            a_matrix_(a_idx, k_idx) = 1;
            a_matrix_(k_idx, a_idx) = 1;
        }
        if (!isGround(b)) {
            a_matrix_(b_idx, k_idx) = -1;
            a_matrix_(k_idx, b_idx) = -1;
        }

        z_vector_(k_idx) = v;
    }

    void stamp(const Resistor& resistor) {
        addAdmittance(resistor.a, resistor.b, 1.0 / resistor.r);
    }

    void stamp(const Vsource& v_source) {
        addVoltage(v_source.a, v_source.b, v_source.k, v_source.v);
    }

    void stamp() {
        for (const auto& resistor : netlist_.getResistors()) {
            stamp(resistor);
        }
        for (const auto& v_source : netlist_.getVoltageSources()) {
            stamp(v_source);
        }
    }

    VectorXd solve() const {
        Eigen::FullPivLU<MatrixXd> lu(a_matrix_);
        if (!lu.isInvertible()) {
            throw std::runtime_error("singular MNA matrix: floating node or voltage-source loop");
        }
        return lu.solve(z_vector_);
    }

private:
    Eigen::Index nodeIndex(node_id id) const {
        return static_cast<Eigen::Index>(std::to_underlying(id)) - 1; // ground -> -1
    }
    Eigen::Index branchIndex(branch_id id) const {
        return num_nodes_ + static_cast<Eigen::Index>(std::to_underlying(id));
    }
    size_t num_nodes_{};
    const NetList& netlist_;
    MatrixXd a_matrix_;
    VectorXd z_vector_;
};

inline void stamp(const Resistor& resistor, MNASystem& mna) {
    mna.addAdmittance(resistor.a, resistor.b, 1.0 / resistor.r);
}
