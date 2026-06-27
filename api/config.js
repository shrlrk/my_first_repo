// api/config.js - Vercel Serverless Function to serve environment variables
export default function handler(req, res) {
  // CORS Headers if needed (Vercel endpoints automatically restrict by default to same-origin)
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  res.status(200).json({
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
  });
}
