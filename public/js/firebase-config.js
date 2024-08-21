import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword  } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';


const firebaseConfig = {
  apiKey: "AIzaSyDguZfuasurvP8U8hKCS6j2X56ELZV655o",
  authDomain: "mathgrading-46962.firebaseapp.com",
  projectId: "mathgrading-46962",
  storageBucket: "mathgrading-46962.appspot.com",
  messagingSenderId: "11241396403",
  appId: "1:11241396403:web:371da53b443fcc8b24b8c6",
  measurementId: "G-HM73NL7DP3"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const functions = getFunctions(app);
const storage = getStorage(app);
const auth = getAuth(app);


console.log('====================window.location.hostname='+window.location.hostname);
try{
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Connecting to Firebase emulators');
    connectFirestoreEmulator(db, 'localhost', 8081);
    connectFunctionsEmulator(functions, 'localhost', 5001);
    connectStorageEmulator(storage, 'localhost', 9199);
    connectAuthEmulator(auth, 'http://localhost:9099');
    console.log('Successfully connected to all emulators');
  } 
}catch(error){
  console.error('Error connecting to emulators:', error);
}

export { app, db, functions, storage, auth, ref, uploadBytes, getDownloadURL, httpsCallable, createUserWithEmailAndPassword, signInWithEmailAndPassword };