# FIT System

**FIT System** es una plataforma de gestión para gimnasios. Integra herramientas de administración y operación del gimnasio en una solución compuesta por una aplicación de escritorio, una aplicación web y servicios de API.

Sitio oficial: [https://fitsystem.com.ar](https://fitsystem.com.ar)

> **Aviso de propiedad:** este repositorio contiene código propietario de FIT System. Su disponibilidad pública en GitHub no concede autorización para copiarlo, modificarlo, reutilizarlo o distribuirlo. Todos los derechos reservados. Para consultas sobre licencias o uso del software, contactarse a través del sitio oficial.

## Componentes del proyecto

El repositorio está organizado como un monorepo con pnpm workspaces y Turborepo.

| Ruta | Componente | Tecnología principal |
|---|---|---|
| `apps/desktop` | Aplicación de escritorio FIT System | Electron, TypeScript |
| `apps/web` | Aplicación web | Next.js, React, TypeScript |
| `apps/api` | API y servicios del sistema | Fastify, TypeScript, Prisma |
| `apps/access-gate-desktop` | Aplicación de escritorio para el acceso | Electron, TypeScript |
| `packages/*` | Paquetes compartidos entre aplicaciones | TypeScript |

Las aplicaciones y paquetes comparten tipos, utilidades y componentes cuando corresponde.

## Funcionalidades

FIT System está orientado a la gestión cotidiana de gimnasios. Entre las áreas funcionales del producto se incluyen:

- Gestión de socios y sus fichas.
- Planes, cuotas, membresías y vencimientos.
- Cobros, pagos y caja.
- Clases y actividades.
- Asistencia y control de acceso.
- Herramientas para la operación y administración del gimnasio.
- Integraciones y servicios complementarios del ecosistema FIT System.

La disponibilidad de cada función puede depender de la versión y de la configuración contratada.

## Tecnologías

- **Node.js:** versión 22.5.0 o superior.
- **pnpm:** versión 9.12.0.
- **Turborepo:** ejecución de tareas del monorepo.
- **TypeScript.**
- **Electron:** aplicaciones de escritorio.
- **Next.js y React:** aplicación web.
- **Fastify:** API.
- **Prisma:** acceso y gestión del esquema de datos.

## Requisitos para desarrollo

Para trabajar con el repositorio se necesita:

1. Node.js 22.5.0 o superior.
2. Corepack habilitado para administrar pnpm.
3. pnpm 9.12.0.
4. Las variables de entorno y servicios requeridos por cada aplicación.

## Instalación de dependencias

Desde la raíz del repositorio:

```bash
corepack enable
pnpm install
```

La configuración de entorno no se incluye en este README. Antes de ejecutar una aplicación, se deben obtener del responsable del proyecto las variables de entorno, credenciales y servicios necesarios. No se deben subir archivos `.env`, claves privadas, tokens ni credenciales al repositorio.

## Comandos disponibles

Ejecutar desde la raíz:

| Comando | Descripción |
|---|---|
| `pnpm build` | Compila los paquetes y aplicaciones configurados para build. |
| `pnpm lint` | Ejecuta las tareas de lint configuradas en el monorepo. |
| `pnpm typecheck` | Ejecuta las verificaciones de tipos. |
| `pnpm test` | Ejecuta las pruebas configuradas. |
| `pnpm db:generate` | Genera el cliente de Prisma de la API. |
| `pnpm db:push` | Sincroniza el esquema de Prisma con la base configurada. |
| `pnpm db:migrate` | Ejecuta migraciones de desarrollo de Prisma. |
| `pnpm db:seed` | Ejecuta la carga inicial de datos configurada. |

Los comandos de base de datos requieren una configuración válida y deben utilizarse únicamente contra el entorno previsto. No ejecutar operaciones de sincronización, migración o seed sobre bases de producción sin autorización y respaldo previo.

## Versiones y publicaciones

Las publicaciones de instaladores de Windows se automatizan mediante GitHub Actions, a partir de tags cuyo nombre comienza con `v`.

El flujo de publicación se encuentra en:

`/.github/workflows/release.yml`

El script `scripts/release.mjs` permite preparar una nueva versión y actualizar los archivos de versión y manifiesto del actualizador.

Ejemplo de uso:

```bash
node scripts/release.mjs patch --dry-run
```

Para publicar una versión real se requiere revisar los cambios, contar con el entorno Git correctamente configurado y tener permisos de escritura en el repositorio. La publicación genera instaladores de Windows y los adjunta a GitHub Releases.

No ejecutar el proceso de publicación como prueba: puede crear commits, tags y releases públicos.

## Descargas y actualizaciones

Los instaladores publicados y los metadatos de actualización se distribuyen actualmente mediante [GitHub Releases](https://github.com/dcorp-sas/FITsystem/releases).

La aplicación de escritorio utiliza `electron-updater` para el mecanismo de actualización configurado en el proyecto. La aplicación portable tiene un comportamiento de actualización diferente al instalador.

## Seguridad

- No incluir secretos, contraseñas, tokens, certificados ni claves privadas en commits.
- No publicar archivos de configuración con credenciales reales.
- Utilizar variables de entorno y secretos administrados para los despliegues.
- No compartir bases de datos reales ni información personal de socios.
- Informar cualquier vulnerabilidad de seguridad de manera privada al responsable del proyecto, en lugar de publicarla en un issue.

## Soporte y contacto

Para información comercial, demostraciones o consultas sobre FIT System:

[https://fitsystem.com.ar](https://fitsystem.com.ar)

---

**FIT System — Software integral para gimnasios.**
