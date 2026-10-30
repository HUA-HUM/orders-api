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
# Crons (hora de Argentina). Expresion con segundos: "seg min hora dia mes diaSemana".
# Sin valor usan el horario por defecto; si la expresion es invalida se loguea un error y tambien.
# Los comentarios van en su propia linea: el .env no admite comentarios al final del valor.
# Por defecto: cada 2 horas en punto
ORDERS_SYNC_CRON=0 0 */2 * * *
# Por defecto: cada hora a los :30
ORDERS_STATUS_CRON=0 30 * * * *
# Header x-api-key que exigen POST /orders/sync, /orders/status-sync y /orders/retry.
# Sin valor esos endpoints responden 500 (se rechaza todo). Los GET no la piden.
API_KEY=
# false: no corre ese cron (los endpoints manuales siguen andando). Sin valor corren.
ORDERS_SYNC_CRON_ENABLED=false
ORDERS_STATUS_CRON_ENABLED=false
```

### Flujo de ordenes (cron `ORDERS_SYNC_CRON`, por defecto cada 2 horas, o `POST /orders/sync`)

`persistence_status` en madre sigue el estado de la orden en Fravega: `PENDING` mientras esta abierta,
`COMPLETED` cuando se entrega o se cancela. El resultado de VBI va en `notification_system_b_status` y `floxu_code`.

1. Trae las ordenes nuevas de Fravega desde marketplace-api (`/fravega/full-orders`), desde el ultimo sync.
2. Las guarda en madre. Las que ya existen se saltean.
3. Si ya esta cancelada o devuelta en Fravega no se envia a VBI: queda `COMPLETED` con `last_error` `[CANCELLED] ...`.
4. Si falta el CUIL o el email del comprador queda `FAILED` con `last_error` `[MISSING_DATA] ...`.
5. La envia a VBI: si responde `status: "success"` queda `PENDING` (o `COMPLETED` si ya fue entregada),
   con `notification_system_b_status: success` y el `tlqtNumber` en `floxu_code`. Si no, `FAILED` con `[VBI_ERROR] ...`.
6. Las ordenes que marketplace-api no pudo completar (falla VTEX / Seller Central) quedan `FAILED` con `[SOURCE_ERROR] ...`.

- `POST /orders/sync?from=...&to=...` reprocesa un rango de fechas de compra a mano.
- `POST /orders/retry/{uniqueKey}` reintenta una orden `FAILED`.

### Estados (cron `ORDERS_STATUS_CRON`, por defecto cada hora a los :30, o `POST /orders/status-sync`)

Recorre las ordenes `PENDING` de madre (`GET /api/orders/pending`), consulta cada una en Fravega y:

- entregada (`Delivered`) → `COMPLETED`;
- cancelada o devuelta (`Canceled` / `Returned` en Seller Central, o `canceled` en VTEX) → `COMPLETED`
  con `last_error` `[CANCELLED] ...` (madre todavia no acepta `CANCELLED`);
- el resto sigue `PENDING`. No avisa a VBI.

Sync, retry y estados no corren en paralelo: si uno esta en curso, el otro responde 409 (o el cron se omite).

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

`POWERAPPS_API_URL` (lleva la clave de Azure, `?code=...`) y `API_KEY` no van en `config.yaml` sino en el Secret
`order-api-secrets`, que se crea una vez a mano en el cluster (no esta en el repo):

```bash
kubectl create secret generic order-api-secrets \
  --from-literal=POWERAPPS_API_URL='https://...azurewebsites.net/api/external-sale-create?code=...' \
  --from-literal=API_KEY='...'
kubectl rollout restart deployment/order-api   # para que el pod tome el valor
```

Mientras no exista, el pod arranca igual pero el envio a VBI falla (las ordenes quedan `FAILED [VBI_ERROR]`)
y los POST protegidos responden 500.

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
