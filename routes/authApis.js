const express = require('express');
const createAuthController = require('../controllers/authentificationController');

const createAuthRouter = (pool) => {
  const router = express.Router();
  const { login, logout, me } = createAuthController(pool);

  router.post('/login', login);
  router.post('/logout', logout);
  router.get('/me', me);

  return router;
};

module.exports = createAuthRouter;
