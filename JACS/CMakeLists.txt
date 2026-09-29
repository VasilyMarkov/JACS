# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Vasily Markov

cmake_minimum_required(VERSION 3.30)
project(JACS)

include(FetchContent)

# Share one dependency checkout between the debug and release build trees, so a
# clean build of either preset does not force a re-download.
set(FETCHCONTENT_BASE_DIR "${CMAKE_SOURCE_DIR}/build/_deps")

set(EIGEN_BUILD_DOC OFF)
set(EIGEN_BUILD_TESTING OFF)
set(EIGEN_BUILD_PKGCONFIG OFF)

FetchContent_Declare(Eigen3
    GIT_REPOSITORY https://gitlab.com/libeigen/eigen.git
    GIT_TAG bc3b39870ecb690a623a3f49149a358b95c5781d # 5.0.1
    GIT_SHALLOW TRUE
    SYSTEM
    EXCLUDE_FROM_ALL
)

set(JSON_BuildTests OFF)
set(JSON_Install OFF)

FetchContent_Declare(nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG 55f93686c01528224f448c19128836e7df245f72 # v3.12.0
    GIT_SHALLOW TRUE
    SYSTEM
    EXCLUDE_FROM_ALL
)

FetchContent_MakeAvailable(Eigen3 nlohmann_json)

# Everything that is not I/O lives here, so the native CLI and the WebAssembly
# module run exactly the same simulator.
add_library(jacs_core STATIC
    src/schematic.cpp
)

target_include_directories(jacs_core PUBLIC src)
target_link_libraries(jacs_core PUBLIC Eigen3::Eigen nlohmann_json::nlohmann_json)

if(EMSCRIPTEN)
    # Exceptions carry circuit errors inside the module. Wasm exceptions are the
    # cheap variant, and the flag has to match for compiling and linking.
    target_compile_options(jacs_core PUBLIC -fwasm-exceptions)

    add_executable(jacs_wasm src/bindings.cpp)
    target_link_libraries(jacs_wasm PRIVATE jacs_core)

    # The bundle lands next to the web sources, which import it as an ES module.
    set(JACS_WASM_OUT "${CMAKE_SOURCE_DIR}/web/src/wasm")
    set_target_properties(jacs_wasm PROPERTIES
        OUTPUT_NAME jacs
        RUNTIME_OUTPUT_DIRECTORY "${JACS_WASM_OUT}"
    )
    target_link_options(jacs_wasm PRIVATE
        -fwasm-exceptions
        -lembind
        -sMODULARIZE=1
        -sEXPORT_ES6=1
        -sEXPORT_NAME=createJacsModule
        # web + worker for the browser, node so the bindings can be tested headless.
        -sENVIRONMENT=web,worker,node
        -sALLOW_MEMORY_GROWTH=1
        -sSTACK_SIZE=1048576
        # TypeScript declarations generated from the Embind registrations.
        --emit-tsd=${JACS_WASM_OUT}/jacs.d.ts
    )
else()
    add_executable(jacs src/main.cpp)
    target_link_libraries(jacs PRIVATE jacs_core)
endif()
