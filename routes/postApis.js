const express = require('express');
const createPostController = require('../controllers/postController');

const createPostRouter = (pool) => {
  const router = express.Router();
  const { getPosts, createPost, addComment, editComment, deleteComment, deletePost, editPost, toggleLike } = createPostController(pool);

  // ── Routes existantes (Etapes 1-3) ─────────────────────────────────────
  router.get('/getPosts', getPosts);
  router.post('/createPost', createPost);

  // ── Routes Etape 4 : interactions sur les posts ─────────────────────────
  // Ajouter un commentaire
  router.post('/:id/comment', addComment);
  // Modifier un commentaire (auteur uniquement, vérif côté MongoDB)
  router.put('/:id/comment/:commentId', editComment);
  // Supprimer un commentaire (auteur uniquement, vérif côté MongoDB)
  router.delete('/:id/comment/:commentId', deleteComment);
  // Modifier un post (propriétaire uniquement)
  router.put('/:id', editPost);
  // Supprimer un post (propriétaire uniquement)
  router.delete('/:id', deletePost);
  // Liker / unliker un post (toggle)
  router.post('/:id/like', toggleLike);

  return router;
};

module.exports = createPostRouter;


