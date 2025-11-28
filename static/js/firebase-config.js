// Configuración de Firebase para AgroMarket Web
// Configuración real de Firebase para agromarket-625b2

const firebaseConfig = {
  apiKey: "AIzaSyDZWmY0ggZthOKv17yHH57pkXsie_U2YnI",
  authDomain: "agromarket-625b2.firebaseapp.com",
  projectId: "agromarket-625b2",
  storageBucket: "agromarket-625b2.firebasestorage.app",
  messagingSenderId: "18163605615",
  appId: "1:18163605615:web:6910d608e280b028d6ad9a",
  measurementId: "G-CVL9DRNMG1"
};

// Exportar la configuración para uso en otros archivos
window.firebaseConfig = firebaseConfig;

// Función para inicializar Firebase (corregida)
function inicializarFirebase() {
  try {
    console.log('🔄 Inicializando Firebase...');
    const startTime = performance.now();
    
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK no está cargado');
    }
    
    // Verificar si ya está inicializado
    if (firebase.apps.length > 0) {
      console.log('✅ Firebase ya está inicializado');
      return firebase.app();
    }
    
    // Verificar que la configuración esté completa
    if (!firebaseConfig || !firebaseConfig.apiKey) {
      throw new Error('Configuración de Firebase incompleta');
    }
    
    // Inicializar Firebase con configuración completa
    const app = firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase inicializado correctamente');
    
    // Configurar Firestore
    const db = firebase.firestore();
    db.settings({
      cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
      ignoreUndefinedProperties: true
    });
    
    const endTime = performance.now();
    console.log(`✅ Firebase configurado en ${(endTime - startTime).toFixed(2)}ms`);
    return app;
    
  } catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
    console.error('❌ Configuración:', firebaseConfig);
    throw error;
  }
}

// Exportar la función de inicialización
window.inicializarFirebase = inicializarFirebase;

// NO inicializar automáticamente - dejar que cada página lo haga según necesite
// Esto evita conflictos cuando múltiples scripts intentan inicializar Firebase
// if (typeof firebase !== 'undefined' && !window.firebaseInitialized) {
//   try {
//     // Verificar que la configuración esté disponible
//     if (window.firebaseConfig) {
//       inicializarFirebase();
//       window.firebaseInitialized = true;
//     } else {
//       console.error('❌ Configuración de Firebase no disponible');
//     }
//   } catch (error) {
//     console.error('❌ Error en inicialización automática:', error);
//   }
// }
