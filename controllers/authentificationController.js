/**
 * Contrôleur d'authentification.
 *
 * @param {object} pool          - Pool PostgreSQL
 * @param {object} socketManager - { getSocketIdByUserId, notifyUserDisconnect }
 *                                 Peut être null si Socket.IO n'est pas encore prêt.
 */
const createAuthController = (pool, socketManager) => {
  const login = async (req, res) => {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ success: false, message: 'Champs manquants.' });
    }

    try {
      const result = await pool.query(
        'SELECT * FROM fredouil.compte WHERE mail = $1',
        [login]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Identifiants incorrects.' });
      }

      const user = result.rows[0];
      const valid = password === user.motpasse;

      if (!valid) {
        return res.status(401).json({ success: false, message: 'Identifiants incorrects.' });
      }

      await pool.query(
        'UPDATE fredouil.compte SET statut_connexion = 1 WHERE mail = $1',
        [user.mail]
      );

      req.session.user = {
        id: user.id,
        email: user.mail,
        nom: user.nom,
        loginAt: new Date().toISOString()
      };

      return res.json({
        success: true,
        message: `Bienvenue ${user.nom} !`,
        user: { email: user.mail, nom: user.nom, loginAt: req.session.user.loginAt }
      });
    } catch (err) {
      console.error('Erreur PostgreSQL :', err);
      return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
  };

  const logout = async (req, res) => {
    const email = req.session.user?.email;
    const userId = req.session.user?.id;
    const nom    = req.session.user?.nom;

    if (email) {
      await pool.query(
        'UPDATE fredouil.compte SET statut_connexion = 0 WHERE mail = $1',
        [email]
      ).catch(err => console.error('Erreur update statut logout :', err));
    }

    // ── Notification WebSocket avant destruction de la session ──────────
    // On notifie les autres utilisateurs que cet utilisateur se déconnecte.
    // Cela doit être fait AVANT session.destroy() car on a besoin de userId/nom.
    if (userId && nom && socketManager) {
      socketManager.notifyUserDisconnect(userId, nom);
    }

    req.session.destroy(() => {
      res.json({ success: true, message: 'Déconnecté.' });
    });
  };

  const me = (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Non connecté.' });
    }

    return res.json({
      success: true,
      user: req.session.user
    });
  };

  return {
    login,
    logout,
    me
  };
};

module.exports = createAuthController;
