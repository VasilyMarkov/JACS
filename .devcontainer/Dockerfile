FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ARG LLVM_VERSION=20
ARG USERNAME=user
ARG USER_UID=1000
ARG USER_GID=1000

# ===== Base packages =====
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    curl \
    git \
    openssh-client \
    sudo \
    gnupg \
    lsb-release \
    software-properties-common \
    pkg-config \
    tar \
    unzip \
    xz-utils \
    python3 \
    python3-pip \
    libgtest-dev \
    nlohmann-json3-dev \
    && rm -rf /var/lib/apt/lists/*

# ===== LLVM repository =====
RUN wget -qO- https://apt.llvm.org/llvm-snapshot.gpg.key \
    | gpg --dearmor \
    > /usr/share/keyrings/llvm.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/llvm.gpg] http://apt.llvm.org/jammy/ llvm-toolchain-jammy-${LLVM_VERSION} main" \
    > /etc/apt/sources.list.d/llvm.list

# ===== Install LLVM / Clang =====
RUN apt-get update && apt-get install -y --no-install-recommends \
    clang-${LLVM_VERSION} \
    clangd-${LLVM_VERSION} \
    clang-tidy-${LLVM_VERSION} \
    clang-format-${LLVM_VERSION} \
    lldb-${LLVM_VERSION} \
    lld-${LLVM_VERSION} \
    llvm-${LLVM_VERSION} \
    llvm-${LLVM_VERSION}-dev \
    libc++-${LLVM_VERSION}-dev \
    libclang-rt-${LLVM_VERSION}-dev \
    libc++abi-${LLVM_VERSION}-dev \
    libunwind-${LLVM_VERSION}-dev \
    libomp-${LLVM_VERSION}-dev \
    && rm -rf /var/lib/apt/lists/*

# ===== Update alternatives =====
RUN update-alternatives --install /usr/bin/clang clang /usr/bin/clang-${LLVM_VERSION} 100 \
 && update-alternatives --install /usr/bin/clang++ clang++ /usr/bin/clang++-${LLVM_VERSION} 100 \
 && update-alternatives --install /usr/bin/clangd clangd /usr/bin/clangd-${LLVM_VERSION} 100 \
 && update-alternatives --install /usr/bin/lldb lldb /usr/bin/lldb-${LLVM_VERSION} 100

ENV CC=clang
ENV CXX=clang++

# ===== Install Ninja =====
RUN wget -q https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-linux.zip \
    && unzip -q ninja-linux.zip -d /usr/bin \
    && rm ninja-linux.zip \
    && ninja --version

ARG CMAKE_VERSION=3.30.3

# ===== Install CMake (Kitware) =====
RUN wget -q https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-linux-x86_64.tar.gz \
    && tar -xzf cmake-${CMAKE_VERSION}-linux-x86_64.tar.gz \
    && ln -sf /cmake-${CMAKE_VERSION}-linux-x86_64/bin/cmake /usr/local/bin/cmake \
    && ln -sf /cmake-${CMAKE_VERSION}-linux-x86_64/bin/ctest /usr/local/bin/ctest \
    && ln -sf /cmake-${CMAKE_VERSION}-linux-x86_64/bin/cpack /usr/local/bin/cpack \
    && ln -sf /cmake-${CMAKE_VERSION}-linux-x86_64/bin/ccmake /usr/local/bin/ccmake \
    && rm cmake-${CMAKE_VERSION}-linux-x86_64.tar.gz \
    && cmake --version

# ===== Build GoogleTest =====
RUN git clone --depth 1 --branch v1.14.0 https://github.com/google/googletest.git \
    && cmake -S googletest -B googletest/build -G Ninja \
        -DCMAKE_CXX_COMPILER=clang++ \
        -DCMAKE_C_COMPILER=clang \
        -DCMAKE_CXX_FLAGS="-stdlib=libc++" \
        -DCMAKE_EXE_LINKER_FLAGS="-fuse-ld=lld -lc++ -lc++abi" \
        -DCMAKE_INSTALL_PREFIX=/usr/local \
    && cmake --build googletest/build \
    && cmake --install googletest/build \
    && rm -rf googletest

# ===== Create restricted user =====
RUN groupadd --gid ${USER_GID} ${USERNAME} \
    && useradd --uid ${USER_UID} --gid ${USER_GID} -m ${USERNAME} \
    && echo "${USERNAME} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${USERNAME}

COPY .devcontainer/requirements.txt /tmp/requirements.txt

RUN pip3 install --no-cache-dir -r /tmp/requirements.txt

USER ${USERNAME}
WORKDIR /home/${USERNAME}/projects

CMD ["/bin/bash"]
