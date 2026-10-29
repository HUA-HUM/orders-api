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
MADRE_API_BASE_URL=https://api.madre.loquieroaca.com
# URL completa de VBI (Azure external-sale-create) con ?code=... No commitear el valor.
# Vacia: el envio a VBI falla y las ordenes quedan FAILED [VBI_ERROR].
POWERAPPS_API_URL=
```

### Flujo de ordenes (cron cada 2 horas o `POST /orders/sync`)

1. Trae las ordenes nuevas de Fravega desde marketplace-api (`/fravega/full-orders`), desde el ultimo sync.
2. Las guarda en madre. Las que ya existen se saltean.
3. Si falta el CUIL o el email del comprador queda `FAILED` con `last_error` `[MISSING_DATA] ...`.
4. La envia a VBI: si responde OK queda `COMPLETED`, si no `FAILED` con `[VBI_ERROR] ...`.
5. Las ordenes que marketplace-api no pudo completar (falla VTEX / Seller Central) quedan `FAILED` con `[SOURCE_ERROR] ...`.

- `POST /orders/sync?from=...&to=...` reprocesa un rango de fechas de compra a mano.
- `POST /orders/retry/{uniqueKey}` reintenta una orden `FAILED`.

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
