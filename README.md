# El Pozo

Torneos y apuestas de Dota 2 entre amigos, con recargas por Yape. En producción en
https://apuestas.bezenti.com.

- **Torneos**: cualquiera crea uno (entrada por jugador, equipos de 1 a 5, de 2 a 16
  equipos, reparto «todo al campeón» o 70/30). Al unirse a un equipo se cobra la
  entrada; quien sale antes de empezar la recupera. El organizador sortea un cuadro
  de eliminación directa, marca los ganadores y el pozo se reparte solo.
- **Apuestas aparte**: pozo común (parimutuel). Pueden ser libres (las resuelve quien
  las crea) o sobre una partida o el campeón de un torneo (se resuelven solas).
- **Billetera**: todo el dinero va en céntimos y cada cambio deja un movimiento.
  Retiros: se descuentan al pedirlos y el admin los paga por Yape a mano.

El primer usuario que se registra es admin. Para nombrar a otro:
`npx tsx --conditions=react-server scripts/hacer-admin.ts <usuario>`.

## Recargas con Yape

1. El usuario pulsa «Recargar». Desde ese momento tiene **3 minutos** para yapear
   (más 30 s de gracia para que la notificación llegue). Solo cuentan los Yapes que
   llegan después de pulsar.
2. Yapea al número del pozo y sube la captura.
3. El observador, [yapi](https://github.com/darwinva97/yapi), lee la notificación
   de Yape en el celular del pozo y nos la reenvía.
4. Si el nombre coincide con el «nombre en Yape» de un único usuario que está
   escuchando, se acredita solo. Si no, el usuario pulsa «Es mío» y el admin lo
   confirma mirando la captura.

### Conectar yapi

En la app de yapi, con la cuenta del celular que recibe los Yapes del pozo:

1. En el dispositivo, marca Yape entre las apps instaladas que pueden leerse
   (yapi la añade sola a su catálogo) y concede el acceso a notificaciones.
2. Crea un canal que enrute desde ese dispositivo y apunte a la app de Yape.
3. Añádele una integración con ejecutor `server` (la ejecuta el worker de
   Cloudflare, no depende de la red del celular) y esta URL:

   ```
   https://apuestas.bezenti.com/api/yape/yapi?token=<YAPE_WEBHOOK_SECRET>
   ```

   yapi no firma sus webhooks, por eso el secreto va en la URL.

El texto de la notificación («Yape! Juan C. Perez R. te envió un pago por S/ 20…»)
se interpreta en `src/lib/yape/yapi.ts`. Las notificaciones que no son un pago
recibido se ignoran, y una misma notificación repetida en el mismo minuto se cuenta
una sola vez.

Sigue existiendo `/api/yape/notificacion` (con `Authorization: Bearer`) para
enviar pagos ya interpretados: `{ "id", "monto", "nombre", "recibido" }`.

## Variables (`.env.local`)

| Variable | Para qué |
| --- | --- |
| `YAPE_NUMERO`, `YAPE_TITULAR` | El Yape del pozo que ven los usuarios al recargar |
| `YAPE_WEBHOOK_SECRET` | Token de la URL de la integración de yapi |
| `YAPE_API_URL`, `YAPE_API_TOKEN` | Opcional: API a consultar cada 3 s (no hace falta con yapi) |
| `YAPE_SIMULADOR=1` | Muestra en Admin un formulario para simular Yapes; quitar en cuanto esté la API |
| `DATA_DIR` | Dónde van la base SQLite y las capturas (por defecto `./data`) |

## Desarrollo y despliegue

```bash
npm run dev
DATA_DIR=$(mktemp -d) npx tsx --conditions=react-server scripts/prueba-logica.ts   # lógica de dinero
npm run build && systemctl --user restart el-pozo                                  # puerto 4090
```

Caddy: `/etc/caddy/sites/apuestas.caddy` (la ruta SSE va sin compresión).
