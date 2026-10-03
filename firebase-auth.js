(function () {
  const config = window.NATURE_FIREBASE_CONFIG || {};
  const configured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
  const listeners = new Set();
  let firebaseUser = null;
  let modules = null;
  let initPromise = Promise.resolve(null);

  function emit(user) {
    firebaseUser = user;
    const detail = user ? {
      uid: user.uid,
      name: user.displayName || user.email?.split('@')[0] || '會員',
      email: user.email || '',
      photoURL: user.photoURL || '',
      provider: 'google'
    } : null;
    listeners.forEach(fn => fn(detail));
    window.dispatchEvent(new CustomEvent('nature-auth-state', { detail }));
  }

  if (configured && location.protocol !== 'file:') {
    initPromise = Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
    ]).then(([appSdk, authSdk, firestoreSdk]) => {
      const firebaseApp = appSdk.initializeApp(config);
      const auth = authSdk.getAuth(firebaseApp);
      const db = firestoreSdk.getFirestore(firebaseApp);
      const provider = new authSdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      modules = { authSdk, firestoreSdk, auth, db, provider };
      authSdk.onAuthStateChanged(auth, emit);
      return modules;
    }).catch(error => {
      console.error('Firebase 初始化失敗', error);
      window.dispatchEvent(new CustomEvent('nature-auth-error', { detail: error.message }));
      return null;
    });
  }

  window.NatureAuth = {
    configured,
    mode: configured ? (location.protocol === 'file:' ? 'needs-server' : 'firebase') : 'local-demo',
    ready: () => initPromise,
    currentUser: () => firebaseUser,
    onChange(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    async signInWithGoogle() {
      const sdk = await initPromise;
      if (!sdk) throw new Error(configured ? '請使用 http://localhost 或正式 HTTPS 網址開啟網站。' : '尚未設定 Firebase。');
      const result = await sdk.authSdk.signInWithPopup(sdk.auth, sdk.provider);
      return result.user;
    },
    async signOut() {
      const sdk = await initPromise;
      if (sdk) await sdk.authSdk.signOut(sdk.auth);
      emit(null);
    },
    async saveDivination(record) {
      const sdk = await initPromise;
      if (!sdk || !firebaseUser) throw new Error('需要先使用 Google 登入。');
      const { collection, addDoc, serverTimestamp } = sdk.firestoreSdk;
      await addDoc(collection(sdk.db, 'users', firebaseUser.uid, 'divinations'), {
        category: record.category,
        question: record.question,
        result: record.result,
        createdAt: serverTimestamp(),
        createdAtText: record.date
      });
    },
    async loadDivinations() {
      const sdk = await initPromise;
      if (!sdk || !firebaseUser) return [];
      const { collection, getDocs, limit, orderBy, query } = sdk.firestoreSdk;
      const q = query(collection(sdk.db, 'users', firebaseUser.uid, 'divinations'), orderBy('createdAt', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  };
})();
