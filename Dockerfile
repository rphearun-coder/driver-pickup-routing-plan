FROM node:20-alpine

WORKDIR /app


# Only package.json, not the lockfile — it was resolved on the host's platform
# (Windows) and npm's optional-dependency bug (npm/cli#4828) then skips installing
# the container's own platform binary for native packages like rollup, e.g.
# "Cannot find module @rollup/rollup-linux-x64-musl". Installing fresh here lets
# npm resolve optional deps for the container's actual platform (linux-musl).
COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5173

# --host 0.0.0.0 is required so the dev server is reachable
# from outside the container (and from teammates on the LAN).
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]