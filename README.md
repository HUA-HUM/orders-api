# order-api

API de ordenes de marketplaces construida con NestJS.

## Local

### Requisitos

- Node.js 20
- npm
- acceso de red a `https://api.marketplace.loquieroaca.com`
- archivo `.env` con:

```env
MARKETPLACE_API_BASE_URL=https://api.marketplace.loquieroaca.com
```

### Levantar en desarrollo

```bash
npm install
npm run start:dev
```

La API queda en:

- `http://localhost:3000`
- `http://localhost:3000/docs`

### Validaciones utiles

```bash
npm run lint
npm test -- --runInBand
npm run build
```

### Docker local

```bash
docker compose up --build
```

## Kubernetes

Los manifests viven en `k8s/`.

Aplicacion manual:

```bash
kubectl apply -f k8s/config.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

## Deploy automatico a produccion

El repo queda preparado para deployar al hacer merge a `main` usando GitHub Actions:

1. Build multi-arch para `linux/amd64`
2. Push a DigitalOcean Container Registry
3. Actualizacion del `Deployment` en DOKS con la imagen taggeada por commit
4. Espera del rollout

### Secretos necesarios en GitHub

Configuralos en `Settings > Secrets and variables > Actions`:

- `DIGITALOCEAN_ACCESS_TOKEN`
- `DOCR_REGISTRY_NAME`
- `DO_KUBERNETES_CLUSTER_NAME`

### Requisitos de infraestructura

Antes de usar el workflow, el cluster debe estar integrado con el registry de DigitalOcean.

Segun la documentacion oficial de DigitalOcean, eso se puede hacer con:

```bash
doctl kubernetes cluster registry add <cluster-name>
```

Documentacion usada:

- [Enable Push-to-Deploy on DigitalOcean Kubernetes Using GitHub Actions](https://docs.digitalocean.com/products/container-registry/how-to/enable-push-to-deploy/)
- [How to Use Your Private DigitalOcean Container Registry with Docker and Kubernetes](https://docs.digitalocean.com/products/container-registry/how-to/use-registry-docker-kubernetes/)

### Lens

Los recursos de Kubernetes tienen labels `app.kubernetes.io/*` para que se vean mas ordenados en Lens:

- `app.kubernetes.io/name=order-api`
- `app.kubernetes.io/component=api`
- `app.kubernetes.io/part-of=order-api`

## Notas

- El workflow no aplica `k8s/cluster-issuer.yaml` en cada deploy porque es un recurso cluster-wide y conviene manejarlo aparte.
- El `Deployment` usa un placeholder `<IMAGE>` que el workflow reemplaza con la imagen exacta del commit antes de aplicar.
