const express = require('express');
const createAuthController = require('../controllers/authentificationController');

// socketManager : { getSocketIdByUserId, notifyUserDisconnect }
const createAuthRouter = (pool, socketManager) => {
  const router = express.Router();
  const { login, logout, me } = createAuthController(pool, socketManager);

  router.post('/login', login);
  router.post('/logout', logout);
  router.get('/me', me);

  return router;
};

module.exports = createAuthRouter;
