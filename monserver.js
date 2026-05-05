// ========================================
// APPLICATION SERVEUR NODE.JS - CerisoNet
// Etape 2 : Gestion de la connexion et mur d accueil
// Etape 5 : Temps reel via WebSockets (Socket.IO)
//   - Notifications connexion / deconnexion
//   - Mises a jour likes, commentaires, partages en temps reel
// ========================================

const https            = require("https");
const fs               = require("fs");
const path             = require("path");
const express          = require("express");
const session          = require("express-session");
const MongoDBStore     = require("connect-mongodb-session")(session);
const mongoose         = require("mongoose");
const { Server }       = require("socket.io");
const initSocketManager = require("./socket/socketManager");
const createPostRouter = require("./routes/postApis");
const createAuthRouter = require("./routes/authApis");
const { Pool }         = require("pg");
require("dotenv").config();

const app      = express();
const PORT     = process.env.PORT || 3197;
const DIST_DIR = path.join(__dirname, "cerisonet-front", "dist", "cerisonet-front", "browser");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(DIST_DIR));

// Store MongoDB pour les sessions
const store = new MongoDBStore({
  uri:        process.env.MONGO_URL,
  collection: process.env.SESSION_COLLECTION
});
store.on("error", err => console.error("Erreur store MongoDB :", err));

// Middleware de session (stocke dans variable pour partage avec Socket.IO)
const sessionMiddleware = session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  store:             store,
  cookie: {
    secure:   true,
    httpOnly: true,
    maxAge:   1000 * 60 * 60 * 2
  }
});
app.use(sessionMiddleware);

// Pool PostgreSQL
const pool = new Pool({
  host:     process.env.PG_HOST,
  port:     process.env.PG_PORT,
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
});

// Connexion MongoDB
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB connecte pour les posts."))
  .catch(err => console.error("Erreur connexion MongoDB posts :", err));

// Serveur HTTPS (reference conservee pour Socket.IO)
const tlsOptions = {
  key:  fs.readFileSync(path.join(__dirname, "certs", "key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "cert.pem"))
};
const httpsServer = https.createServer(tlsOptions, app);

// Socket.IO attache au meme serveur HTTPS
// Note CORS : on accepte toute origine car la securite est geree par la
// verification de session dans io.use() (socket.request.session.user).
// Bloquer ici par URL empecherait les connexions depuis le serveur pedago.
const io = new Server(httpsServer, {
  cors: {
    origin: true,        // autorise toute origine (meme serveur en prod)
    credentials: true
  }
});

// Gestionnaire de sockets : retourne { getSocketIdByUserId, notifyUserDisconnect }
const socketManager = initSocketManager(io, sessionMiddleware);

// Routes Express (declarees APRES io + socketManager)
app.use("/posts", createPostRouter(pool, io, socketManager));
app.use("/auth",  createAuthRouter(pool, socketManager));

// Fallback Angular (HTML5 routing)
app.get(/^(?!\/(auth|posts)\b).*/, (req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

// Demarrage
httpsServer.listen(PORT, () => {
  console.log("Serveur HTTPS + Socket.IO lance sur le port " + PORT);
});
