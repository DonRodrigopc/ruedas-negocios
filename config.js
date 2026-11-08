// ============================================================
//  CONFIGURACIÓN DE LA PLATAFORMA
// ============================================================
//  mode: 'demo'   -> funciona sin internet ni cuentas. Los datos se guardan
//                    solo en este navegador. Ideal para probar.
//  mode: 'sheets' -> modo real. Los datos se guardan en tu Google Sheets
//                    mediante Google Apps Script (gratis). Ver LEEME.md.
// ============================================================
window.RN_CONFIG = {
  mode: 'sheets',

  // Dirección de la "Aplicación web" de Apps Script (termina en /exec)
  apiUrl: 'https://script.google.com/macros/s/AKfycby6pOWQxQVovy-Ng0njsurQBpDn9Zl-3ZKEF0HwRmAmgJWWGhLv3DRJwdPwnIybcBxP/exec',

  appName: 'Ruedas de Negocios',
  appTagline: 'Turismo Chile',
  organizer: 'SERNATUR Región de Valparaíso',

  // Solo para el modo demo (en modo real se define en apps-script/Code.gs)
  superadminEmails: ['rmunoz.asesoriaspdi@gmail.com'],

  // Región que se muestra en la portada principal
  homeRegion: 'valparaiso',

  // Fotos y logo de cada región. Agrega regiones copiando el bloque.
  // Las fotos que no existan se omiten automáticamente.
  regions: {
    valparaiso: {
      name: 'Región de Valparaíso',
      logo: 'img/logo-region-valparaiso-blanco.png',
      photos: [
        'fotos/valparaiso/portada-1.jpg',
        'fotos/valparaiso/portada-2.jpg',
        'fotos/valparaiso/portada-3.jpg',
        'fotos/valparaiso/portada-4.jpg',
        'fotos/valparaiso/portada-5.jpg'
      ]
    }
    // ,biobio: {
    //   name: 'Región del Biobío',
    //   logo: 'img/logo-region-biobio-blanco.png',
    //   photos: ['fotos/biobio/portada-1.jpg', 'fotos/biobio/portada-2.jpg']
    // }
  }
};
