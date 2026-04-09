# Container and Kubernetes setup

## Docker (local)

Build and run everything:

```bash
HOMEPAGE_API_IMAGE=... HOMEPAGE_FRONTEND_IMAGE=... docker compose up -d
```

Services:

- Frontend: `http://localhost:4200`
- API: `http://localhost:8080`
- MongoDB: `mongodb://localhost:27017`

The Compose file pulls images (e.g. from Docker Hub). Set:

- `HOMEPAGE_API_IMAGE` (example: `myuser/homepage-api:latest`)
- `HOMEPAGE_FRONTEND_IMAGE` (example: `myuser/homepage-frontend:latest`)

To build locally instead, use the build overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

For Google OAuth, ensure your Google Cloud Console OAuth client includes:

- **Authorized JavaScript origins**: `http://localhost:4200`
- **Authorized redirect URIs**: `http://localhost:4200/auth/google/callback`

## Kubernetes (starter manifests)

Base manifests are in `k8s/base`.
Dev overlay is in `k8s/overlays/dev`.

Apply dev overlay:

```bash
kubectl apply -k k8s/overlays/dev
```

By default, images are set to:

- `homepage-frontend:latest`
- `homepage-api:latest`

If you use a remote registry, update images in `k8s/base/*deployment.yaml`
or use kustomize `images` overrides.

### Port forwarding vs YAML

`kubectl port-forward` is **not** a Kubernetes object — there is nothing to put in a YAML manifest for it.

The usual YAML equivalent is **`type: NodePort`** on a `Service`. The dev overlay already patches this:

| Service   | Node port | URL (minikube)                          |
|-----------|-----------|-----------------------------------------|
| `frontend`| `30420`   | `http://$(minikube ip):30420`           |
| `api`     | `30808`   | `http://$(minikube ip):30808`           |

After `kubectl apply -k k8s/overlays/dev`, open the UI at `http://<minikube-ip>:30420`.

**Angular `apiUrl`:** the app is built with `environment.apiUrl` (often `http://localhost:8080`). From your laptop, the API is at `http://<minikube-ip>:30808`, not `localhost`. Either:

- use **Ingress** so browser and API share one host, or  
- rebuild the frontend image with `apiUrl` set to `http://<minikube-ip>:30808`, or  
- keep using **`kubectl port-forward svc/api 8080:8080`** only for the API while using NodePort for the UI.

### Notes

- Update `k8s/base/secret.yaml` or overlay patches with real OAuth/JWT values.
- OAuth callback must match Google Console exactly.
- Ingress host defaults to `homepage.local`; update to your real domain.
