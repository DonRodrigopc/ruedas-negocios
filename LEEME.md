# Plataforma de Ruedas de Negocios Turísticos — Etapa 1 (versión 2)

Todo gratis y sin tarjeta de crédito:

- **Página web:** GitHub Pages (hosting gratuito).
- **Datos:** una planilla de Google Sheets en tu Google Drive.
- **Servidor:** Google Apps Script, que viene incluido con tu cuenta Google y controla cuentas, permisos y correos.

**Incluye:** links separados para vendedores y compradores, inscripción (el comprador no necesita registro SERNATUR), aprobación por región con aviso por correo, perfiles editables, catálogo, contacto visible solo con autorización, recuperación de contraseña por correo, exportación a Excel, idiomas ES/EN/PT, diseño Marca Chile responsivo y fotos por región.

---

## 1. Probar ahora (modo demo, sin instalar nada)

1. Abre `index.html` con doble clic (Chrome o Edge).
2. Entra en **Ingresar** y elige una cuenta de prueba (contraseña `demo1234`).
3. El botón **Reiniciar datos de prueba** vuelve todo al inicio.

---

## 2. Fotografías y logos

- Pon las fotos de Valparaíso en `fotos/valparaiso/` con los nombres `portada-1.jpg` a `portada-5.jpg` (horizontal, idealmente 1920×1080 y menos de 500 KB cada una). Se rotan solas; las que falten se omiten.
- Más regiones: ver `fotos/LEEME-FOTOS.txt` y el bloque `regions` en `config.js`.
- Logos en `img/`: `logo-marca-chile.png` y `logo-region-valparaiso-blanco.png`.

---

## 3. Instalar el servidor gratuito (Google Sheets + Apps Script) — unos 10 minutos

1. Entra a https://sheets.new con tu cuenta Google y nombra la planilla, por ejemplo *Ruedas de Negocios – Base de datos*.
2. Menú **Extensiones → Apps Script**. Borra lo que aparece y pega todo el contenido de `apps-script/Code.gs`.
3. Al inicio del código:
   - en `SUPERADMINS` cambia `tu-correo@gmail.com` por tu correo;
   - en `SITE_URL` pon la dirección pública cuando la tengas (paso 4). Así los correos incluyen el link.
4. Guarda (ícono de disco). Arriba elige la función **setup** y presiona **Ejecutar**.
   Google pedirá permisos: *Revisar permisos → tu cuenta → Configuración avanzada → Ir a (proyecto) → Permitir*.
   Aparece este aviso porque el script es tuyo y no está publicado en la tienda de Google; es normal.
   Al terminar verás en la planilla las hojas Users, Events, Registrations, etc.
5. **Implementar → Nueva implementación** → tipo (engranaje) **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
   - Implementar → copia la **URL de la aplicación web** (termina en `/exec`).
6. En `config.js` de la plataforma:
   - `mode: 'sheets'`
   - `apiUrl: 'la URL que copiaste'`

> Si después modificas `Code.gs`: **Implementar → Administrar implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar**. La URL no cambia.

**Límites gratuitos (sobran para ruedas de hasta varios cientos de empresas):**

- Gmail permite unos 100 correos al día desde el script, entre aprobaciones y recuperaciones de contraseña.
- Cada acción tarda alrededor de 1 a 2 segundos.

**Seguridad:**

- Las contraseñas se guardan cifradas (hash con sal), nunca en texto.
- Todos los permisos (quién ve qué) se validan en el script, no solo en la pantalla.
- No compartas la planilla con nadie que no deba ver todos los datos.

---

## 4. Publicar la página gratis en GitHub Pages — unos 10 minutos

1. Crea una cuenta gratis en https://github.com
2. Botón **New repository** → nombre `ruedas-negocios` → **Public** → *Create repository*.
3. En el repositorio: **Add file → Upload files** y arrastra **el contenido** de la carpeta `plataforma`:
   `index.html`, `config.js`, y las carpetas `css`, `js`, `img`, `fotos`.
   No hace falta subir `apps-script`, aunque tampoco pasa nada si lo subes. Luego presiona **Commit changes**.
4. **Settings → Pages** → *Source: Deploy from a branch* → Branch **main** / **(root)** → Save.
5. En 1 o 2 minutos tu sitio queda en `https://TU-USUARIO.github.io/ruedas-negocios/`
6. Copia esa dirección en `SITE_URL` de `Code.gs` (y vuelve a implementar como nueva versión).

Para actualizar fotos o archivos: **Add file → Upload files** con el archivo nuevo y el mismo nombre.

> El código de la página queda público (así funciona GitHub Pages gratis), pero **los datos no**: viven en tu Google Sheets y solo se entregan según los permisos del script.

---

## 5. Primer uso

1. Abre tu sitio → **Ingresar** → escribe tu correo (el de `SUPERADMINS`) y una contraseña → **crea tu cuenta**.
2. En **Administración** crea el evento. Déjalo en "Borrador", revísalo y luego cámbialo a "Inscripciones abiertas".
3. Copia los **dos links de convocatoria**: uno para **vendedores** y otro para **compradores**. Difúndelos por separado según el público.
4. Para sumar colegas de regiones: en Administración agrega su correo y región, y ellos crean su cuenta en **Ingresar** con ese correo.

---

## 6. Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Página principal |
| `config.js` | Modo (demo/real), dirección del servidor, regiones, fotos y logos |
| `js/app.js` | Pantallas y lógica |
| `js/i18n.js` | Textos en español, inglés y portugués |
| `js/db-local.js` | Datos del modo demo |
| `js/db-sheets.js` | Conexión con Google Apps Script |
| `css/styles.css` | Diseño (colores Marca Chile) |
| `img/` | Logos |
| `fotos/` | Fotografías por región |
| `apps-script/Code.gs` | Servidor: se pega en Google Apps Script |
