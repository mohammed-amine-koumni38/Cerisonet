// ========================================
// APPLICATION SERVEUR NODE.JS - CérisoNet
// Étape 2: Gestion de la connexion et mur d'accueil
// ========================================

// Dépendances pour HTTPS et fichiers
const https   = require('https');
const fs      = require('fs');
const path    = require('path');

// Framework web Express
const express = require('express');

// Gestion des sessions
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const mongoose = require('mongoose');
const createPostRouter = require('./routes/postApis');
const createAuthRouter = require('./routes/authApis');

// Base de données PostgreSQL
const { Pool } = require('pg');

// Configuration depuis le fichier .env
require('dotenv').config();

// Initialisation de l'application Express
const app  = express();
const PORT = process.env.PORT || 3197;

// Répertoire contenant les fichiers statiques (Angular compilé)
const DIST_DIR = path.join(__dirname, 'cerisonet-front', 'dist', 'cerisonet-front', 'browser');

// ── Middleware ──────────────────────────────────────────────
// Parse les données JSON des requêtes HTTP
app.use(express.json());
// Parse les données de formulaires HTML
app.use(express.urlencoded({ extended: true }));
// Sert les fichiers statiques (HTML, CSS, JS) de l'application Angular
app.use(express.static(DIST_DIR));

// ── Store MongoDB pour les sessions ────────────────────────
// (1) Stockage des informations de session côté serveur dans MongoDB
const store = new MongoDBStore({
  uri: process.env.MONGO_URL,
  // Nom de la collection qui doit correspondre au port d'écoute
  collection: process.env.SESSION_COLLECTION
});
// Gestion des erreurs de connexion au store MongoDB
store.on('error', err => console.error('Erreur store MongoDB :', err));

// ── Gestionnaire de sessions ────────────────────────────────
// (1) Configuration de la gestion des sessions utilisateur
//const isProd = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET,           // Clé secrète pour signer les sessions
  resave: false,                                 // Ne pas sauvegarder si pas de modification
  saveUninitialized: false,                      // Ne pas créer une session vide
  store: store,                                  // Utilise MongoDB pour stocker les sessions
  cookie: { 
    secure: true,      // Seulement sur HTTPS
    httpOnly: true,    // Pas accessible depuis JavaScript côté client
    maxAge: 1000 * 60 * 60 * 2  // Durée de vie: 2 heures en millisecondes
  }
}));

// ── Pool PostgreSQL ─────────────────────────────────────────
// (1) Connexion à la base de données PostgreSQL
// Pool: gère un ensemble de connexions réutilisables
const pool = new Pool({
  host:     process.env.PG_HOST,              // Serveur PostgreSQL
  port:     process.env.PG_PORT,              // Port PostgreSQL
  user:     process.env.PG_USER,              // Nom d'utilisateur
  password: process.env.PG_PASSWORD,          // Mot de passe
  database: process.env.PG_DATABASE           // Nom de la base de données
});





// ── Connexion MongoDB pour les posts ───────────────────────
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log('MongoDB connecte pour les posts.'))
  .catch(err => console.error('Erreur connexion MongoDB posts :', err));



app.use('/posts', createPostRouter(pool));
app.use('/auth', createAuthRouter(pool));
// ── Route principale + fallback Angular (HTML5 routing) ────
// Pour toutes les routes non traitées explicitement, retourne index.html
// Cela permet à Angular de gérer le routage côté client
app.get(/^(?!\/(auth|posts)\b).*/, (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});



// ── Mur d'accueil (protégé par session) ────────────────────
// (4) Retourne les données du mur d'accueil temporaire
// Cette route est accessible seulement si l'utilisateur est connecté (session valide)


// ── API Posts (MongoDB) ────────────────────────────────────


// ── Lancement HTTPS ─────────────────────────────────────────
// Options TLS: lecture des fichiers certificats et clés privées
const tlsOptions = {
  // Clé privée pour déchiffrer le trafic HTTPS
  key: fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
  // Certificat public pour établir la connexion HTTPS
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem'))
};

// Création et démarrage du serveur HTTPS
https.createServer(tlsOptions, app).listen(PORT, () => {
  console.log(`Serveur HTTPS lance sur le port ${PORT}`);
});
