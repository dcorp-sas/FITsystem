# Copias de seguridad locales de FIT system

## Funcionamiento

En instalaciones de escritorio que usan SQLite, la API crea una copia automática al iniciar y luego programa copias diarias a las 04:00 de la hora local del equipo. Se conservan las últimas 14 copias en una carpeta `backups` junto al archivo de base de datos, con nombres `fitsystem-AAAA-MM-DDTHH-MM-SS-sssZ.db`.

La copia se genera mediante SQLite `VACUUM INTO`, que crea una base consistente sin depender de copiar solamente el archivo activo mientras SQLite está escribiendo. Los errores se registran en el log de la API; una copia debe verificarse y probarse, no darse por válida solo porque exista un archivo.

En el servidor de producción con PostgreSQL se utiliza el flujo de copias de infraestructura documentado en [VPS.md](./VPS.md). Las copias locales de SQLite no sustituyen una copia externa.

## Protección adicional recomendada

- Copiá periódicamente una copia reciente a una unidad externa o almacenamiento seguro fuera de la PC.
- Protegé el acceso a la carpeta de backups y al equipo del gimnasio.
- No guardes la única copia en el mismo disco que contiene la base original.
- Antes de actualizar, reinstalar o migrar, confirmá que exista una copia reciente.
- Probá la restauración en una instalación separada con datos de prueba.

## Restauración manual de emergencia

1. Cerrá FIT system y confirmá que los procesos del escritorio y la API local hayan terminado.
2. Localizá la carpeta `data/backups` dentro del directorio de datos de FIT system. La ubicación exacta depende del perfil de Windows donde se instaló; el log de inicio registra la carpeta `userData`.
3. Copiá la base actual `fitsystem.db` a un nombre distinto, por ejemplo `fitsystem-before-restore.db`. No la sobrescribas sin conservar esa copia.
4. Elegí un archivo `fitsystem-*.db` que sepas que es anterior al problema y copialo como `fitsystem.db` en la carpeta de datos.
5. Iniciá FIT system y comprobá socios, cuotas, cobros y caja antes de continuar operando.
6. Si el sistema no inicia o faltan movimientos, cerralo y contactá a soporte antes de realizar más cambios.

Una restauración vuelve la base al estado de la copia seleccionada; los movimientos posteriores a esa fecha pueden no estar incluidos. La copia debe mantenerse fuera de línea cuando sea posible para protegerla frente a robo, fallo de disco o ransomware.
