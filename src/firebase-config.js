// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDguZfuasurvP8U8hKCS6j2X56ELZV655o",
  authDomain: "mathgrading-46962.firebaseapp.com",
  projectId: "mathgrading-46962",
  storageBucket: "mathgrading-46962.appspot.com",
  messagingSenderId: "11241396403",
  appId: "1:11241396403:web:371da53b443fcc8b24b8c6",
  measurementId: "G-HM73NL7DP3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);