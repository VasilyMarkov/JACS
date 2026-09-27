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
FetchContent_MakeAvailable(Eigen3)

add_executable(jacs
    src/main.cpp
)

target_link_libraries(jacs PRIVATE Eigen3::Eigen)
