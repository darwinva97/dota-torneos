# El Pozo

Torneos y apuestas de Dota 2 entre amigos, con recargas por Yape. En producción en
https://apuestas.bezenti.com.

- **Torneos**: cualquiera crea uno (entrada por jugador, equipos de 1 a 5, de 2 a 16
  equipos, reparto «todo al campeón» o 70/30). Al unirse a un equipo se cobra la
  entrada; quien sale antes de empezar la recupera. El organizador sortea un cuadro
  de eliminación directa, marca los ganadores y el pozo se reparte solo.
  - **Garantía de puntualidad** opcional: parte de la inscripción se devuelve a
    quien llega a tiempo y va al premio si falta.
  - **Premio base**: el organizador puede poner un monto de su saldo (y subirlo
    después). Por defecto se le suma lo recaudado; con «premio fijo» el premio es
    solo la base y lo recaudado vuelve al organizador al terminar.
- **Formatos de torneo** (`src/lib/formatos.ts`, cuadros en `src/lib/llaves.ts`):
  - Dota 2: **por descarte** (eliminación directa), **upper y lower bracket** como
    en The International (doble eliminación, gran final sin reinicio) y
    **descarte + upper y lower** (para muchos equipos: descarte hasta quedar 4 u 8).
  - Ajedrez (uno contra uno, con ritmo: bala, blitz, rápidas, clásicas u otro):
    **eliminación**, **todos contra todos** y **suizo** (`src/lib/puntos.ts`, con
    tablas, descansos, Buchholz y Sonneborn-Berger), y **Arena** o **Suizo en
    Lichess**.
- **Lichess** (`src/lib/lichess.ts`): cada jugador conecta su cuenta por OAuth
  (PKCE, permiso `tournament:write`; el token se guarda cifrado con
  `LICHESS_CLAVE`). Quien organiza crea el torneo en Lichess con su cuenta,
  privado con contraseña; inscribimos a todos solos; cada minuto se sincroniza y,
  al terminar, se reparte el premio por la clasificación de Lichess. Se eligió
  Lichess porque su API pública permite crear torneos e inscribir jugadores; la
  de chess.com es solo de lectura.
- **Apuestas aparte**, en dos modalidades:
  - **Parche 1 a 1** (por defecto): dos bandos; el evento solo puede empezar
    (cerrar jugadas) o resolverse cuando lo apostado a cada bando es igual, así
    quien gana cobra el doble. Mientras no esté parchada, cada uno puede retirar
    su apuesta y quien la gestiona puede devolver lo que sobra del bando que puso
    de más. En los torneos, la partida no puede empezar ni marcarse ganador sin
    parchar sus apuestas. Hay «Empate o tablas: devolver a todos».
  - **Pozo común**: varias opciones; quienes aciertan se reparten todo en
    proporción a lo que pusieron.
  Pueden ser libres (las resuelve quien las crea) o sobre una partida o el
  campeón de un torneo (se resuelven solas).
- **Billetera**: todo el dinero va en céntimos y cada cambio deja un movimiento.
  Historial con filtros (Yape, torneos, apuestas) y resumen de lo recargado,
  retirado, ganado en premios y el balance de las apuestas.
- **Retiros**: el usuario pide un retiro a su Yape y se le descuenta al momento;
  la solicitud le llega al admin (contador en el menú y la campana). El admin lo
  yapea y anota el número de operación, o lo rechaza con un motivo y el monto
  vuelve al saldo. Mientras esté pendiente, el usuario puede cancelarlo.
- **Deudas y retenciones**: el admin asigna a un jugador un monto que debe a
  alguien. Se le retiene al momento lo que tenga y, después, todo lo que le entre
  (recargas, premios, devoluciones) paga primero la deuda y pasa al acreedor.
  Mientras deba no puede inscribirse, apostar ni retirar. El admin puede
  perdonar lo que falte.
- **Gestión de usuarios (admin)**: lista con saldos, lo que tienen en juego,
  recargas, retiros y deudas; ficha de cada uno con su historial, ajustes
  manuales de saldo (acreditar o descontar con motivo), multas (van al pozo y
  funcionan como una deuda) y permisos de admin.

El primer usuario que se registra es admin. Para nombrar a otro:
`npx tsx --conditions=react-server scripts/hacer-admin.ts <usuario>`.

## Comisión de apuestas y pozo acumulado

El admin elige en `/admin` qué porcentaje de lo apostado se reparten los ganadores (100, 95… 50; ahora
90, es decir, 10 % de comisión). Cada apuesta guarda el porcentaje vigente al crearse (`mercados.pago_pct`). Al resolverse, la diferencia
(`mercados.comision`) va al **pozo acumulado de la página** (`src/lib/acumulado.ts`, tabla `acumulado`, que se
ve en `/pozo`, en la barra lateral y en el inicio). Si la apuesta se anula, se empata o nadie acierta, se
devuelve todo y no hay comisión.

Al crear un torneo, el admin decide qué parte del pozo acumulado entra al premio (nada, 25, 50, 75 % o todo):
se aparta al momento (`torneos.pozo_pagina`) y el resto queda para el siguiente. Durante el torneo puede sumar
más desde su página. Si el torneo se cancela, vuelve al pozo. El Yape del admin debe cubrir también el pozo
acumulado.

## Cambio de jugadores en una partida

Por defecto en cada partida juegan los integrantes inscritos del equipo. Si en un enfrentamiento juega otro
(un cambio o un suplente que sea usuario de la página), quien organiza lo registra en
`/torneos/{id}/partida/{pid}` (`src/lib/alineaciones.ts`, tabla `alineaciones`). Al guardar:

1. La apuesta de esa partida se anula y se devuelve todo a cada uno.
2. Se abre una apuesta nueva igual y vacía (si ya se jugaba, la partida vuelve a «por jugar»).
3. Cada persona que había apostado recibe un aviso en la campana (`/avisos`, tabla `avisos`) con el enlace.
4. Al organizador se le da un mensaje listo para pegar en el grupo de WhatsApp.

Las apuestas al campeón del torneo no se tocan, y el premio sigue siendo de los integrantes inscritos.

## Recargas con Yape

1. «Recargar» abre una pantalla de preparación (abrir Yape, tener el número y el
   monto listos). El usuario escribe **el monto que va a yapear** y, al pulsar
   **«Iniciar recarga»**, entra en la **cola**. Solo una persona recarga a
   la vez: cuando le toca, tiene un **turno exclusivo de 30 segundos** (más
   20 s de gracia para que la notificación llegue) y solo cuentan los Yapes que
   llegan durante su turno. No hace falta subir captura.
2. El turno termina al acreditarse el Yape, al pulsar «Es mío», al cancelar o al
   vencer, y empieza el del siguiente. Quien cierra la pantalla mientras espera
   pierde su sitio a los 2 minutos.
3. **Penalización**: si a alguien se le venció o canceló el turno y vuelve a
   intentarlo en los 10 minutos siguientes, su turno no empieza hasta pasado 1
   minuto; si llega otra persona en ese minuto, va primero. Se repite cada vez que
   falla, hasta que recargue bien.
4. El observador, [yapi](https://github.com/darwinva97/yapi), lee la notificación
   de Yape en el celular del pozo y nos la reenvía.
5. **El monto siempre tiene que cuadrar**: se acredita solo el Yape que llega
   durante el turno por el monto exacto declarado, venga de la cuenta que venga
   (el nombre solo desempata). Si no cuadra, el usuario pulsa «Es mío» y el admin
   lo revisa, con el aviso de que el monto no coincide.

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
| `LICHESS_CLAVE` | 64 caracteres hex para cifrar los tokens de Lichess |
| `PUBLIC_URL` | URL pública, para el regreso del OAuth de Lichess |
| `LICHESS_URL` | Solo para pruebas: apunta a `scripts/lichess-simulado.ts` |

## Desarrollo y despliegue

```bash
npm run dev
DATA_DIR=$(mktemp -d) npx tsx --conditions=react-server scripts/prueba-logica.ts   # lógica de dinero
DATA_DIR=$(mktemp -d) npx tsx --conditions=react-server scripts/prueba-lichess.ts  # Lichess (simulado)
npx tsx scripts/prueba-cuadros.ts                                                  # cuadros y suizo
npm run build && systemctl --user restart el-pozo                                  # puerto 4090
```

Caddy: `/etc/caddy/sites/apuestas.caddy` (la ruta SSE va sin compresión).
