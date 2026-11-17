# Builds the Organic Maps generator_tool at the exact commit the app was built from, so the
# produced .mwm files match the app's data format. Run with maps-pipeline/run.sh.
FROM ubuntu:24.04 AS build

ARG OM_REPO=https://github.com/organicmaps/organicmaps.git
ARG OM_REF=master
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake ninja-build git ca-certificates \
      python3 python3-pip python3-venv \
      libc++-dev libfreetype-dev libglvnd-dev libharfbuzz-dev libicu-dev libsqlite3-dev \
      zlib1g-dev libbz2-dev libexpat1-dev \
      qt6-base-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /om
RUN git init organicmaps && cd organicmaps \
    && git remote add origin "$OM_REPO" \
    && git fetch --depth 1 origin "$OM_REF" \
    && git checkout --detach FETCH_HEAD \
    && git submodule update --init --recursive --depth 1 --jobs 8 \
    && ./configure.sh 2>/dev/null || true

# Only the generator binaries, no Qt desktop app and no tests.
RUN cd organicmaps && cmake -S . -B ../build -G Ninja \
      -DCMAKE_BUILD_TYPE=Release -DSKIP_QT_GUI=ON -DBUILD_TESTING=OFF -DSKIP_TESTS=ON -DBUILD_DEV_SANDBOX=OFF \
    && cmake --build ../build --target generator_tool mwm_diff_tool

# osmctools (osmconvert/osmupdate/osmfilter) used by maps_generator.
RUN cd organicmaps/tools/osmctools && mkdir -p /om/osmctools \
    && for t in osmconvert osmupdate osmfilter; do gcc -O3 -o /om/osmctools/$t $t.c -lz; done

RUN cd organicmaps/tools/python/maps_generator && python3 -m venv /om/venv \
    && /om/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY build-syria.sh /om/build-syria.sh
COPY make_countries.py /om/make_countries.py
COPY countries.upstream.json /om/countries.upstream.json
RUN chmod +x /om/build-syria.sh
VOLUME ["/om/work", "/om/out"]
ENTRYPOINT ["/om/build-syria.sh"]
