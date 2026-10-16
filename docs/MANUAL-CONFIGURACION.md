# FIT System — Manual de configuración

Guía para dejar el sistema funcionando: **de dónde se obtiene cada dato** y
**cómo cargarlo**. Está pensada para el dueño o administrador del gimnasio, no
hace falta saber programar.

Todo se configura desde el panel, entrando con un usuario **OWNER** o **ADMIN**,
en el menú **Configuración**. Cada pestaña corresponde a un tema.

> **Secretos:** los campos marcados como *secreto* (tokens, contraseñas, claves)
> se guardan **cifrados** en la base. A la hora de mostrarlos se ven ocultos; si
> los dejás vacíos al guardar, no se borran.

## Índice

1. [General](#1-general)
2. [Ingreso (QR fijo)](#2-ingreso-qr-fijo)
3. [Cobros (MercadoPago)](#3-cobros-mercadopago)
4. [ARCA (Facturación)](#4-arca-facturación)
5. [WhatsApp](#5-whatsapp)
6. [Email (SMTP)](#6-email-smtp)
7. [Impresión](#7-impresión)
8. [Reconocimiento facial](#8-reconocimiento-facial)
9. [Nube (app del socio)](#9-nube-app-del-socio)
10. [Red local](#10-red-local)
11. [Licencia](#11-licencia)
12. [Variables de servidor](#12-variables-de-servidor-avanzado)

---

## 1. General

Datos básicos del gimnasio. Se usan en los tickets, los mensajes a los socios y
la app.

| Campo | De dónde sale |
| --- | --- |
| Nombre | El nombre comercial del gimnasio. |
| CUIT | Lo encontrás en la constancia de inscripción de ARCA/AFIP. |
| Moneda | La que usás para cobrar (por defecto ARS). |
| Email / Teléfono / Dirección | Datos de contacto que mostrás al público. |

---

## 2. Ingreso (QR fijo)

Acá se configura el **cartel con QR** que se imprime y se pega en la entrada. El
socio lo escanea con la cámara de la **app del socio** y su ingreso queda
registrado solo, sin pasar por recepción.

| Campo | Qué poner |
| --- | --- |
| Ingreso por QR habilitado | **Sí** para usar el cartel. |
| Formato / rotación | **Fijo (nunca cambia)** — recomendado. Si elegís diaria o semanal, el QR cambia y hay que **volver a imprimir** el cartel cada vez. |
| Título / Texto principal / Texto al pie | Lo que se imprime arriba y abajo del QR. |
| Color del QR (hex) | Color del código. Conviene oscuro sobre blanco (ej. `#0b1120`). |
| Tamaño del QR (px) | 512 alcanza para una hoja A4/carta. |

> El **QR para imprimir** no está en esta pestaña: se genera y se imprime desde
> **Acceso y asistencia** (ese es el único lugar donde vive el QR, para evitar
> confusiones).

**Métodos de asistencia:** en la misma pantalla podés activar/desactivar cómo
pueden registrar el ingreso (QR, tarjeta RFID, reconocimiento facial, huella,
molinete). Los que no tengas instalados, desactivalos.

---

## 3. Cobros (MercadoPago)

Sirve para cobrar con **MercadoPago**: link de pago, **terminal Point** y **QR
fijo**. Es opcional: sin esto podés cobrar igual en efectivo/débito y registrar
el pago a mano.

### Cómo obtener las credenciales

1. Entrá a **https://www.mercadopago.com.ar/** con la cuenta del gimnasio.
2. Andá a **Tu negocio → Configuración → Credenciales** (o
   **https://www.mercadopago.com.ar/developers/panel**).
3. Copiá:
   - **Public Key** (`APP_USR-...`) → campos `PUBLIC_KEY` / `POINT_PUBLIC_KEY` / `QR_PUBLIC_KEY`.
   - **Access Token** (`APP_USR-...`, antes decía *Production credentials*) → campos `ACCESS_TOKEN` / `POINT_ACCESS_TOKEN` / `QR_ACCESS_TOKEN`.
4. Para la **terminal Point**: en **Point → Dispositivos** copiá el **ID de la
   terminal** (ej. `NEWLAND_N950__...`) → campo `POINT_DEVICE_ID`.
5. Para **QR**: creá una **caja (POS)** en **QR → Cajas**; copiá su **ID** y su
   **External ID** → campos `QR_POS_ID` y `QR_POS_EXTERNAL_ID`.
6. **Webhook**: en **Webhooks** poné como URL
   `https://<tu-api>/api/integrations/mercadopago/webhook` y copiá la **clave
   secreta** → campo `WEBHOOK_SECRET`.

### Campos

| Campo | Uso |
| --- | --- |
| `ACCESS_TOKEN` / `PUBLIC_KEY` | Credenciales generales. |
| `POINT_*` | Terminal Point (cobro presencial). |
| `QR_*` | QR dinámico/fijo. |
| `WEBHOOK_SECRET` | Verifica que el aviso de pago venga de MercadoPago. |
| `TRANSFER_ALIAS` | Alias/CBU que querés mostrar para transferencias. |
| `RETURN_URL` | A dónde vuelve el socio después de pagar. |

Después de cargar, usá el botón **Probar conexión** de la tarjeta de estado.

> **En la nube:** para que el webhook funcione, el servidor necesita la variable
> `PUBLIC_URL` apuntando a la API (ver [Variables de servidor](#12-variables-de-servidor-avanzado)).

---

## 4. ARCA (Facturación)

Emite facturas y notas de crédito electrónicas (ex AFIP). Es opcional.

| Campo | De dónde sale |
| --- | --- |
| CUIT del emisor | Tu CUIT (constancia de inscripción). |
| Punto de venta | El número de punto de venta habilitado en ARCA (ej. `1`). |
| Entorno | **Homologación** para probar; **Producción** para facturar de verdad. |
| Tipo de comprobante | Según tu condición: Monotributo → **Factura C**; Resp. Inscripto → A/B/C. |
| Concepto | Productos (1), Servicios (2) o ambos (3). |
| Condición IVA emisor/receptor | Tu condición impositiva y la del socio. |
| Certificado / Clave privada (PEM) | El par **certificado + clave** que genera ARCA para tu CUIT (ver abajo). |
| Certificado `.p12` (base64) | Alternativa al par PEM. |
| Contraseña del `.p12` | La que le pusiste al exportar el `.p12`. |

### Cómo obtener el certificado

1. Entrá a **https://www.arca.gob.ar/** con tu clave fiscal (nivel 3).
2. **Administración de Certificados Digitales → Adherir Servicios → Servicios
   Interactivos → Facturación Electrónica**.
3. Generá un **certificado** y descargá el **`.crt`** junto con la **clave
   privada `.key`**.
4. Pegá el contenido de ambos (texto que empieza con `-----BEGIN ...`) en los
   campos **Certificado (PEM)** y **Clave privada (PEM)**.

Si tenés un único archivo **`.p12`**, convertilo a base64 y pegalo en
`CERT_P12` (o, si corrés en la misma PC, indicá la ruta del archivo en
`CERT_PATH`).

> Para usar el sistema con facturación real se necesita, además, la variable
> `SETTINGS_ENC_KEY` definida (ver [Variables de servidor](#12-variables-de-servidor-avanzado)).

**Puntos de venta por sucursal:** en la tarjeta *Puntos de venta* podés darle a
cada sede su propio punto de venta; si lo dejás en 0, usa el global.

---

## 5. WhatsApp

⚠️ **Cambió el funcionamiento.** Antes el sistema abría WhatsApp Web y había que
escanear un QR **cada vez** que se enviaba un mensaje. Ahora se **vincula el
número una sola vez** y el sistema envía los mensajes solo, desde el servidor.

### Cómo vincular el número (una sola vez)

1. En **Configuración → WhatsApp**, cargá el **Número de WhatsApp del gimnasio**
   (con código de país, sin `+` ni espacios; ej. `5491155551234`) y guardá.
2. En la tarjeta **Conexión de WhatsApp**, tocá **Conectar WhatsApp**.
3. Aparece un **QR**. En el teléfono del gimnasio abrí **WhatsApp →
   Dispositivos vinculados → Vincular un dispositivo** y escaneá el QR.
4. Cuando el estado pasa a **Conectado**, ya está. Usá **Enviar prueba** para
   verificar.

A partir de ahí, los avisos (bienvenida, vencimientos, pago confirmado, etc.) y
los envíos manuales desde **Notificaciones** salen **automáticamente por
WhatsApp**, sin abrir nada.

> - La sesión se guarda en la PC donde corre el sistema (`WHATSAPP_AUTH_DIR`).
>   Si esa carpeta se borra, hay que re-escanear el QR.
> - Si cerrás sesión desde el teléfono (**Dispositivos vinculados → Salir**), el
>   sistema lo detecta y hay que vincular de nuevo.
> - Usá un número dedicado del gimnasio; es una vinculación tipo *WhatsApp Web*
>   (no una API de empresa).

### Campo

| Campo | Uso |
| --- | --- |
| `BUSINESS_PHONE` | El número que vas a vincular. Se usa también para los mensajes salientes y como referencia. |
| `DEFAULT_MESSAGE` | Texto por defecto al enviar desde **Notificaciones** (opcional). |

> **Alternativa avanzada (opcional):** si más adelante querés usar la **API
> oficial de WhatsApp Cloud (Meta)**, se puede cargar `CLOUD_TOKEN` +
> `PHONE_NUMBER_ID` (y opcionalmente `API_VERSION`) en la categoría `WHATSAPP`.
> El sistema la usa como respaldo automático si la sesión vinculada no está
> conectada. Requiere una cuenta de Meta Business y un número verificado.

---

## 6. Email (SMTP)

Envía emails reales: bienvenida, avisos de vencimiento, comprobantes. Es opcional
(sin configurar, los avisos quedan registrados como *pendientes*).

| Campo | Qué poner |
| --- | --- |
| Correo desde el que enviás | Tu dirección de correo (ej. `gimnasio@gmail.com`). |
| Contraseña de la aplicación | **No** es tu contraseña normal (ver abajo). |
| Nombre y correo que ve el socio | Ej. `Mi Gimnasio <gimnasio@gmail.com>`. |
| Servidor de correo (SMTP) | `smtp.gmail.com` para Gmail; `smtp.office365.com` para Outlook. |
| Puerto | `587` (recomendado) o `465`. |
| Conexión segura (true/false) | `false` para el puerto 587 (STARTTLS); `true` para 465 (SSL). |

### Gmail: contraseña de aplicación

Gmail no deja usar la contraseña normal desde programas. Hay que generar una
**contraseña de aplicación**:

1. Activá la **verificación en 2 pasos** en tu cuenta de Google.
2. Entrá a **https://myaccount.google.com/apppasswords**.
3. Creá una contraseña para **Correo / Otro (FIT System)**.
4. Copiá el código de 16 letras que te muestra y pegalo en **Contraseña de la
   aplicación**.

Hay botones de **Carga rápida** con los datos de Gmail y Outlook; solo completá
usuario y contraseña.

---

## 7. Impresión

Dónde sale el ticket de cobro.

| Campo | Qué elegir |
| --- | --- |
| ¿Dónde imprimir? | **Impresora conectada a esta PC** (la más común), **Impresora de la terminal Point**, o **En las dos**. |
| Nombre de la impresora | El nombre exacto en Windows (ej. `EPSON TM-T20`). Si lo dejás vacío, usa la predeterminada. |
| Imprimir automáticamente al cobrar | **Sí** para imprimir el comprobante al confirmar el pago. |
| Servidor de impresión | Avanzado. Por defecto `http://127.0.0.1:3999` (lo levanta la app de escritorio). |
| Terminal Point | ID de la terminal para imprimir en su impresora integrada. |

Usá **Imprimir prueba** para verificar.

> La impresión funciona en la **PC donde corre el sistema** (la que tiene la
> impresora). En modo red local, la impresión se configura **por equipo**.

---

## 8. Reconocimiento facial

Permite que el socio ingrese mirando a la cámara.

1. Abrí la **ficha del socio** y tocá **Registrar rostro**.
2. El socio entra mirando la cámara desde **Registrar asistencia**.

| Campo | Qué poner |
| --- | --- |
| Exigencia del reconocimiento | Avanzado. Entre `0.4` y `0.6` (más bajo = más estricto). Vacío = `0.55`. |

Si la cámara no conecta: revisá que esté enchufada y que el navegador tenga
permiso para usarla.

---

## 9. Nube (app del socio)

Conecta tu sistema con la nube para que la **app del socio** vea los mismos
socios, cuotas y credenciales. El sistema **sigue funcionando sin internet** y se
sincroniza solo cuando hay conexión.

| Campo | Qué poner |
| --- | --- |
| Dirección de la nube | La URL de la API en la nube (ej. `https://fitsystem-api.onrender.com`). Es la que provee quien te instaló el sistema. |
| Nombre del gimnasio | El nombre que va a figurar en la nube. |
| Clave corta (opcional) | Un identificador corto (ej. `mi-gimnasio`). |
| Clave de sincronización existente | **Solo** si vas a reconectar un gimnasio ya dado de alta (te la da el proveedor). Si es la primera vez, dejala vacía. |

Después de **Conectar a la nube**, usá **Sincronizar ahora** para forzar una
sincronización. El panel muestra la última sincronización y el último error.

---

## 10. Red local

Para usar FIT System en **varias computadoras** del mismo local.

- **Esta PC sola (por defecto):** el sistema funciona únicamente en esta
  computadora.
- **Esta PC es el servidor:** las demás PC abren el panel desde el navegador con
  la **dirección de red** que muestra la pantalla (algo como
  `http://192.168.0.10:3000`) y entran con su usuario y contraseña. Todas ven y
  cargan sobre la misma información.

Al elegir el modo servidor, la app **se reinicia** para aplicar el cambio. Si
Windows lo pide, **permití el acceso a FIT System en el firewall** para redes
privadas.

---

## 11. Licencia

La licencia se administra desde la pantalla de **Licencia** (o desde el bloqueo
de activación, si la prueba venció).

1. Copiá el **ID de instalación** que muestra el sistema.
2. Enviá ese ID al proveedor (contacto: `contacto.fitsystem@gmail.com`) para que
   te genere el código.
3. Pegá el **código de licencia** y activá.

La variable `LICENSE_CONTACT` define a qué correo se pide el código.

---

## 12. Variables de servidor (avanzado)

Estas **no** se cargan en el panel: se configuran en el servidor (o en la PC del
gimnasio, archivo `.env`). En la app de escritorio muchas se generan solas.

| Variable | Para qué sirve | Dónde se obtiene |
| --- | --- | --- |
| `DATABASE_URL` | Base de datos (SQLite local o PostgreSQL en la nube). | La define la instalación. |
| `JWT_SECRET` | Firma de sesiones. Obligatoria en producción (≥32 caracteres). | Se genera al instalar (o `generateValue` en Render). |
| `SETTINGS_ENC_KEY` | Cifra los secretos guardados (MP, ARCA, SMTP). | `openssl rand -hex 32`. |
| `API_PORT` / `API_HOST` | Puerto y dirección de la API. | `3001`; en la nube `0.0.0.0`. |
| `WEB_ORIGIN` | Orígenes permitidos (panel + app de socios), separados por coma. | Las URLs de tus servicios. |
| `PUBLIC_URL` | URL pública de la API (webhook de MercadoPago). | La URL de tu API en la nube. |
| `SOCIOS_URL` | URL de la app de socios (retorno de pago). | La URL de la PWA de socios. |
| `WHATSAPP_AUTH_DIR` | Carpeta donde se guarda la sesión de WhatsApp vinculada. | Por defecto, junto a la base de datos. |
| `LICENSE_SERVER` | URL del Licensador. | La provee el proveedor. |
| `LICENSE_PUBLIC_KEY` | Clave pública para verificar licencias. | Viene embebida. |
| `LICENSE_CONTACT` | Correo para pedir el código de licencia. | `contacto.fitsystem@gmail.com`. |
| `PROVIDER_BACKUP_TOKEN` | Respaldo del estado del Licensador. | La provee el proveedor. |

Referencia completa con comentarios: `apps/api/.env.example` y
[`docs/RUNBOOK.md`](./RUNBOOK.md).

---

## Preguntas frecuentes

**¿Necesito internet para que funcione el gimnasio?**
No. El sistema funciona sin internet. La nube (app del socio) y el envío de
WhatsApp/email necesitan conexión, pero el resto sigue andando y se sincroniza
cuando vuelve.

**Un secreto quedó guardado mal, ¿cómo lo cambio?**
Volvé a cargarlo en su pestaña y guardá. Los campos secretos vacíos **no** borran
el valor anterior.

**Cargué WhatsApp pero no envía.**
Verificá que el estado diga **Conectado** (si dice *Escaneá el QR*, hay que
vincular de nuevo) y usá **Enviar prueba**.

**El email no sale.**
Revisá que sea una **contraseña de aplicación** (no la normal), el puerto
(`587` con *seguro = false*, o `465` con *seguro = true*) y el servidor SMTP.
