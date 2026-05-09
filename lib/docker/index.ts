/**
 * lib/docker/index.ts
 *
 * Thin wrapper around the Docker Engine API via `dockerode`.
 * We connect through the host's Docker socket, which is bind-mounted into
 * the Ghost container at /var/run/docker.sock.
 */
import Dockerode from "dockerode";

// Single shared client (lazily created)
let _docker: Dockerode | null = null;

export const getDockerClient = (): Dockerode => {
  if (!_docker) {
    _docker = new Dockerode({ socketPath: "/var/run/docker.sock" });
  }
  return _docker;
};

export { Dockerode };
