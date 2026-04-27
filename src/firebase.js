// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

// ⚠️ Replace with YOUR Firebase project credentials from Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyBwQIVwU2R_sr1R6_iCgqL2apqSgf_jJts",
  authDomain: "smart-iv-drip-7a810.firebaseapp.com",
  databaseURL: "https://smart-iv-drip-7a810-default-rtdb.firebaseio.com",
  projectId: "smart-iv-drip-7a810",
  storageBucket: "smart-iv-drip-7a810.firebasestorage.app",
  messagingSenderId: "765679157317",
  appId: "1:765679157317:web:d9f32a61534088ffc8a32c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
export default app;