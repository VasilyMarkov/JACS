#include <print>
#include <vector>
#include <optional>
#include <unordered_set>
#include <unordered_map>
#include <memory>

enum class NodeId: uint32_t {};
enum class BranchId: uint32_t {};

constexpr NodeId k_ground{};

struct Resistor  { NodeId a, b; double r; };
struct Vsource   { NodeId a, b; double v; BranchId k; };

class NetList {
public:
    NodeId node(std::string_view name);

    void add(Resistor resistor) {
        std::get<std::vector<Resistor>>(elements_).push_back(resistor);
    }
private:
    std::tuple<std::vector<Resistor>, std::vector<Vsource>> elements_;
};


class MNASystem {
public:
    void addAdmittance(NodeId a, NodeId b, double y);
private:
};

void stamp(const Resistor& resistor, MNASystem& mna) {
    mna.addAdmittance(resistor.a, resistor.b, 1.0 / resistor.r);
}

int main() {
    
}