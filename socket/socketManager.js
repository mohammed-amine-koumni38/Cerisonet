// ========================================
// GESTIONNAIRE WEBSOCKET – Socket.IO
// Notifications temps réel :
//   - Connexion / Déconnexion utilisateur
//   - Interactions sur les posts (likes, commentaires, partages)
// ========================================

/**
 * Initialise Socket.IO sur le serveur HTTPS et retourne les utilitaires
 * nécessaires aux contrôleurs HTTP pour émettre des événements.
 *
 * @param {import('socket.io').Server} io             - Instance Socket.IO
 * @param {Function}                  sessionMiddleware - express-session partagé
 * @returns {{ getSocketIdByUserId: Function, notifyUserDisconnect: Function }}
 */
const initSocketManager = (io, sessionMiddleware) => {

  // ── Structures de données internes ─────────────────────────────────────
  // Map principale : userId (number) → { socketId: string, nom: string }
  const connectedUsers = new Map();

  // Map inverse : socketId (string) → { userId: number, nom: string }
  // Permet de retrouver l'utilisateur depuis son socket lors d'une déconnexion
  const socketToUser = new Map();

  // Map des timers de déconnexion différée (protection contre les faux déco)
  // userId (number) → NodeJS.Timeout
  // But : éviter d'émettre "Ahmed s'est déconnecté" lors d'un simple refresh
  // car l'utilisateur se reconnecte dans la seconde qui suit.
  const disconnectTimers = new Map();

  // Délai avant d'annoncer une déconnexion (ms)
  // Doit être > au temps de rechargement de page habituel
  const DISCONNECT_GRACE_MS = 6000;

  // ── Partage du middleware de session avec Socket.IO ─────────────────────
  // express-session a besoin d'un objet "res" minimal car il appelle
  // res.on('finish', ...) pour tenter de sauvegarder la session.
  // On fournit un faux objet avec toutes les methodes attendues.
  // La session n'est jamais sauvegardee (ce socket est en lecture seule)
  // mais elle est correctement LUE et attachee a socket.request.session.
  io.use((socket, next) => {
    const fakeRes = {
      end:            () => {},
      getHeader:      () => null,
      setHeader:      () => fakeRes,
      removeHeader:   () => fakeRes,
      on:             () => fakeRes,   // pour res.on('finish', ...)
      once:           () => fakeRes,
      emit:           () => fakeRes,
      removeListener: () => fakeRes,
      writableEnded:  false,
    };
    sessionMiddleware(socket.request, fakeRes, next);
  });

  // ── Handler de connexion entrante ──────────────────────────────────────
  io.on('connection', (socket) => {

    // Lecture de la session utilisateur injectée par le middleware
    const sessionUser = socket.request.session?.user;

    // Sécurité : rejette immédiatement toute connexion sans session valide
    // (empêche les connexions non authentifiées)
    if (!sessionUser || !sessionUser.id) {
      socket.disconnect(true);
      return;
    }

    const { id: userId, nom } = sessionUser;

    // ── Gestion du refresh de page ──────────────────────────────────────
    // Si un timer de déconnexion est en attente pour cet utilisateur,
    // c'est qu'il vient de refresh : on annule le faux-déco
    if (disconnectTimers.has(userId)) {
      clearTimeout(disconnectTimers.get(userId));
      disconnectTimers.delete(userId);
      console.log(`[Socket] REFRESH annulé pour ${nom} (userId=${userId})`);
    }

    // Détecte si c'est une vraie première connexion (login) ou un refresh
    const isFirstLogin = !connectedUsers.has(userId);

    // Enregistre le socket actif (un seul par utilisateur à la fois)
    connectedUsers.set(userId, { socketId: socket.id, nom });
    socketToUser.set(socket.id, { userId, nom });

    // N'émet la notification de connexion QUE lors d'un vrai login
    // (pas lors d'un refresh de page)
    if (isFirstLogin) {
      // broadcast : envoie à tous SAUF l'émetteur
      socket.broadcast.emit('notif:user_connected', { nom });
      console.log(`[Socket] LOGIN  : ${nom} (userId=${userId}) | socket=${socket.id}`);
    } else {
      console.log(`[Socket] RECONN : ${nom} (userId=${userId}) | socket=${socket.id}`);
    }

    // ── Handler de déconnexion ──────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      const info = socketToUser.get(socket.id);
      if (!info) return; // Déjà nettoyé (ex: logout HTTP)

      socketToUser.delete(socket.id);

      // Vérifie que ce socket est bien le socket actif de l'utilisateur
      // (cas où l'utilisateur a plusieurs onglets : seul le dernier compte)
      const current = connectedUsers.get(info.userId);
      if (!current || current.socketId !== socket.id) return;

      console.log(`[Socket] DÉCO (${reason}) de ${info.nom} — timer de grâce lancé`);

      // Déconnexion différée : attend DISCONNECT_GRACE_MS avant d'annoncer
      const timer = setTimeout(() => {
        // Vérifie une dernière fois que l'utilisateur ne s'est pas reconnecté
        const stillActive = connectedUsers.get(info.userId);
        if (stillActive && stillActive.socketId === socket.id) {
          connectedUsers.delete(info.userId);
          io.emit('notif:user_disconnected', { nom: info.nom });
          console.log(`[Socket] LOGOUT/FERMETURE confirmé : ${info.nom}`);
        }
        disconnectTimers.delete(info.userId);
      }, DISCONNECT_GRACE_MS);

      disconnectTimers.set(info.userId, timer);
    });
  });

  // ── Utilitaires exportés ───────────────────────────────────────────────

  /**
   * Retourne le socketId actif d'un utilisateur, ou null s'il est déconnecté.
   * Utilisé par les contrôleurs pour envoyer des notifications ciblées.
   *
   * @param {number} userId
   * @returns {string|null}
   */
  const getSocketIdByUserId = (userId) => {
    return connectedUsers.get(userId)?.socketId ?? null;
  };

  /**
   * Déconnecte proprement un utilisateur lors d'un logout HTTP explicite.
   *
   * Ordre d'opérations :
   *  1. Annule le timer de déco différée (s'il existe)
   *  2. Nettoie les Maps (avant la déconnexion socket pour éviter le doublon)
   *  3. Émet immédiatement notif:user_disconnected à tous
   *  4. Coupe le socket côté serveur
   *
   * @param {number} userId
   * @param {string} nom
   */
  const notifyUserDisconnect = (userId, nom) => {
    // Annule le timer différé s'il était en cours
    if (disconnectTimers.has(userId)) {
      clearTimeout(disconnectTimers.get(userId));
      disconnectTimers.delete(userId);
    }

    const info = connectedUsers.get(userId);
    if (info) {
      // Nettoie les Maps AVANT de déconnecter le socket
      // → le handler 'disconnect' ne trouvera plus l'info et ne réémettra pas
      connectedUsers.delete(userId);
      socketToUser.delete(info.socketId);

      // Notifie tous les utilisateurs connectés (y compris celui qui se déco)
      io.emit('notif:user_disconnected', { nom });
      console.log(`[Socket] LOGOUT HTTP : ${nom} (userId=${userId})`);

      // Coupe le socket côté serveur
      const socket = io.sockets.sockets.get(info.socketId);
      if (socket) socket.disconnect(true);
    }
  };

  return { getSocketIdByUserId, notifyUserDisconnect };
};

module.exports = initSocketManager;
