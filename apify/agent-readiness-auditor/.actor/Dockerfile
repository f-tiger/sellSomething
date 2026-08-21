# Apify base image with Node.js 20 (no browsers — this actor only needs fetch).
FROM apify/actor-node:20

# Copy package manifests first to leverage Docker layer caching.
COPY package*.json ./

# Install production dependencies only.
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Copy the rest of the actor source.
COPY . ./

# Run the actor.
CMD npm start --silent
