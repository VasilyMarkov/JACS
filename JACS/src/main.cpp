// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Vasily Markov

#include "schematic.hpp"

#include <fstream>
#include <iostream>
#include <iterator>
#include <nlohmann/json.hpp>
#include <sstream>
#include <string>

// Runs one analysis request (see schematic.hpp) read from a file, or from stdin when no file is
// given, and prints the JSON response. Exits with 1 when the analysis fails.
int main(int argc, char** argv) {
    try {
        std::ostringstream request;
        if (argc > 1) {
            std::ifstream file(argv[1]);
            if (!file) {
                std::cerr << "cannot open " << argv[1] << '\n';
                return 2;
            }
            request << file.rdbuf();
        } else {
            request << std::cin.rdbuf();
        }

        const std::string response = jacs::run(request.str());
        std::cout << response << '\n';
        return nlohmann::json::parse(response).value("ok", false) ? 0 : 1;
    } catch (const std::exception& e) {
        std::cerr << "error: " << e.what() << '\n';
        return 2;
    }
}
