// ========================================
// CONTRÔLEUR DES POSTS – Etape 4
// Gestion posts, tris, filtres, commentaires, likes, suppression
// ========================================

const Post = require('../models/postModel');
const mongoose = require('mongoose');

// Longueur max acceptée pour un commentaire
const MAX_COMMENT_LENGTH = 1000;
// Longueur max acceptée pour le corps d'un post
const MAX_BODY_LENGTH = 2000;
// Nombre max de posts par requête (protection contre abus)
const MAX_LIMIT = 50;

/**
 * Contrôleur des posts.
 *
 * @param {object} pool          - Pool PostgreSQL
 * @param {object} io            - Instance Socket.IO (broadcast à tous)
 * @param {object} socketManager - { getSocketIdByUserId, notifyUserDisconnect }
 */
const createPostController = (pool, io, socketManager) => {

  // ── Utilitaire : enrichit les posts avec les auteurs SQL ──────────────
  // Evite de faire N requêtes SQL (une seule requête batchée)
  const fetchAuthors = async (posts) => {
    const setAuthors = new Set();
    for (const post of posts) {
      if (post.createdBy != null) setAuthors.add(post.createdBy);
      for (const comment of (post.comments || [])) {
        if (comment.commentedBy != null) setAuthors.add(comment.commentedBy);
      }
      for (const uid of (post.likedBy || [])) {
        if (uid != null) setAuthors.add(uid);
      }
    }
    const authorIds = Array.from(setAuthors).filter(id => Number.isInteger(id));
    if (authorIds.length === 0) return new Map();
    const result = await pool.query(
      'SELECT id, nom, prenom, pseudo FROM fredouil.compte WHERE id = ANY($1::int[])',
      [authorIds]
    );
    return new Map(result.rows.map(u => [u.id, u]));
  };

  // ── GET /getPosts ──────────────────────────────────────────────────────
  // Query params :
  //   limit    : nb de posts (défaut 10, max 50)
  //   cursor   : _id du dernier post chargé (pagination curseur)
  //   sort     : date_desc | date_asc | likes_desc  (défaut date_desc)
  //   hashtag  : filtre par hashtag exact
  const getPosts = async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Non connecte.' });
    }

    try {
      const limit = Math.min(parseInt(req.query.limit) || 10, MAX_LIMIT);
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : null;

      // Validation du paramètre sort (whitelist)
      const ALLOWED_SORTS = ['date_desc', 'date_asc', 'likes_desc'];
      const sort = ALLOWED_SORTS.includes(req.query.sort) ? req.query.sort : 'date_desc';

      // Filtre hashtag : nettoyage et limitation de longueur (anti-injection)
      const hashtag = typeof req.query.hashtag === 'string'
        ? req.query.hashtag.trim().substring(0, 100)
        : null;

      const query = {};

      // Filtre par hashtag (recherche exacte dans le tableau)
      if (hashtag) {
        query.hashtags = hashtag;
      }

      // Pagination par curseur (uniquement pour les tris temporels)
      if (cursor && sort !== 'likes_desc') {
        if (!mongoose.Types.ObjectId.isValid(cursor)) {
          return res.status(400).json({ success: false, message: 'Cursor invalide.' });
        }
        query._id = sort === 'date_asc'
          ? { $gt: new mongoose.Types.ObjectId(cursor) }
          : { $lt: new mongoose.Types.ObjectId(cursor) };
      }

      // Tri MongoDB selon l'option choisie
      const mongoSort =
        sort === 'date_asc'    ? { _id: 1 } :
        sort === 'likes_desc'  ? { likes: -1, _id: -1 } :
                                 { _id: -1 };

      const posts = await Post.find(query)
        .sort(mongoSort)
        .limit(limit)
        .lean();

      // Charger les posts originaux partagés (batch, une seule requête MongoDB)
      // On filtre les valeurs non-ObjectId (ex: anciens docs avec shared: true)
      const sharedIds = posts
        .map(p => p.shared)
        .filter(id => id != null && mongoose.Types.ObjectId.isValid(id));
      let sharedPostsMap = new Map();
      let sharedPostsList = [];
      if (sharedIds.length > 0) {
        sharedPostsList = await Post.find({ _id: { $in: sharedIds } }).lean();
        for (const sp of sharedPostsList) {
          sharedPostsMap.set(sp._id.toString(), sp);
        }
      }

      // Enrichissement des auteurs (posts + posts partagés en une seule requête SQL)
      const userMap = await fetchAuthors([...posts, ...sharedPostsList]);

      const returnedPosts = posts.map(post => {
        const sharedId = post.shared ? post.shared.toString() : null;
        const sp = sharedId ? sharedPostsMap.get(sharedId) : null;
        return {
          ...post,
          user: userMap.get(post.createdBy) || null,
          comments: (post.comments || []).map(c => ({
            ...c,
            user: userMap.get(c.commentedBy) || null
          })),
          likedByUsers: (post.likedBy || []).map(uid => userMap.get(uid) || null).filter(Boolean),
          sharedPost: sp ? {
            ...sp,
            user: userMap.get(sp.createdBy) || null,
            likedByUsers: (sp.likedBy || []).map(uid => userMap.get(uid) || null).filter(Boolean),
            comments: (sp.comments || []).map(c => ({
              ...c,
              user: userMap.get(c.commentedBy) || null
            }))
          } : null
        };
      });

      // nextCursor : ID du dernier élément retourné, null si fin de flux
      // Pas de curseur pour likes_desc (pagination non supportée)
      const nextCursor = (posts.length === limit && sort !== 'likes_desc')
        ? posts[posts.length - 1]._id.toString()
        : null;

      return res.json({
        success: true,
        posts: returnedPosts,
        nextCursor,
        user: req.session.user
      });
    } catch (err) {
      console.error('Erreur GET /posts :', err);
      return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
  };

  // ── POST /createPost ───────────────────────────────────────────────────
  const createPost = async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Non connecte.' });
    }

    const { body, image, hashtags, shared } = req.body;

    // Validation : corps du post obligatoire
    if (!body || !String(body).trim()) {
      return res.status(400).json({ success: false, message: 'Le texte du post est obligatoire.' });
    }

    // Validation : limitation de la longueur du corps
    if (String(body).trim().length > MAX_BODY_LENGTH) {
      return res.status(400).json({ success: false, message: `Le texte est trop long (max ${MAX_BODY_LENGTH} caractères).` });
    }

    const now = new Date();
    const payload = {
      date: now.toLocaleDateString('fr-FR'),
      hour: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      body: String(body).trim(),
      createdBy: req.session.user.id,
      image: {
        // Nettoyage des champs image (anti-injection, limitation longueur)
        url:   typeof image?.url   === 'string' ? image.url.substring(0, 500)   : '',
        title: typeof image?.title === 'string' ? image.title.substring(0, 200) : ''
      },
      // Limitation à 20 hashtags, 50 caractères chacun
      hashtags: Array.isArray(hashtags)
        ? hashtags.slice(0, 20).map(h => String(h).substring(0, 50))
        : [],
      // Validation du shared : doit être un ObjectId MongoDB valide
      shared: shared && mongoose.Types.ObjectId.isValid(shared) ? new mongoose.Types.ObjectId(shared) : null
    };

    try {
      const createdPost = await Post.create(payload);

      // ── Notification WebSocket lors d'un partage ─────────────────────
      // Si c'est un partage (shared != null), on notifie le propriétaire
      // du post original et on incrémente son compteur de partages.
      if (payload.shared && io && socketManager) {
        // Incrément atomique du compteur de partages sur le post original
        const originalPost = await Post.findByIdAndUpdate(
          payload.shared,
          { $inc: { shares: 1 } },
          { new: true, select: 'createdBy shares' }
        ).lean();

        if (originalPost) {
          const originalPostId = payload.shared.toString();

          // Broadcast à tous : mise à jour du compteur de partages
          io.emit('post:updated', {
            postId: originalPostId,
            type:   'share',
            shares: originalPost.shares
          });

          // Notification ciblée au propriétaire (si connecté et différent du partageur)
          if (originalPost.createdBy !== req.session.user.id) {
            const ownerSocketId = socketManager.getSocketIdByUserId(originalPost.createdBy);
            if (ownerSocketId) {
              io.to(ownerSocketId).emit('notif:post_interaction', {
                type:     'share',
                postId:   originalPostId,
                actorNom: req.session.user.nom || 'Quelqu\'un'
              });
            }
          }
        }
      }

      return res.status(201).json({ success: true, post: createdPost });
    } catch (err) {
      console.error('Erreur POST /posts :', err);
      return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
  };

  // ── POST /:id/comment ──────────────────────────────────────────────────
  // Ajoute un commentaire sur un post existant
  const addComment = async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Non connecte.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'ID de post invalide.' });
    }

    // Validation du texte du commentaire
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ success: false, message: 'Le commentaire ne peut pas être vide.' });
    }
    if (text.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ success: false, message: `Commentaire trop long (max ${MAX_COMMENT_LENGTH} caractères).` });
    }

    const now = new Date();
    const comment = {
      text,
      commentedBy: req.session.user.id,
      date: now.toLocaleDateString('fr-FR'),
      hour: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };

    try {
      // $push atomique : ajout du commentaire sans race condition
      const post = await Post.findByIdAndUpdate(
        id,
        { $push: { comments: comment } },
        { new: true, lean: true }
      );

      if (!post) {
        return res.status(404).json({ success: false, message: 'Post introuvable.' });
      }

      // Enrichissement du post retourné avec les auteurs SQL
      const userMap = await fetchAuthors([post]);
      const enrichedPost = {
        ...post,
        user: userMap.get(post.createdBy) || null,
        comments: (post.comments || []).map(c => ({
          ...c,
          user: userMap.get(c.commentedBy) || null
        }))
      };

      // ── Notifications WebSocket temps réel ───────────────────────────
      // Notification ciblée au propriétaire du post (si connecté et différent du commentateur)
      if (io && socketManager && post.createdBy !== req.session.user.id) {
        const ownerSocketId = socketManager.getSocketIdByUserId(post.createdBy);
        if (ownerSocketId) {
          io.to(ownerSocketId).emit('notif:post_interaction', {
            type:     'comment',
            postId:   id,
            actorNom: req.session.user.nom || 'Quelqu\'un'
          });
        }
      }

      return res.json({ success: true, post: enrichedPost });
    } catch (err) {
      console.error('Erreur POST /:id/comment :', err);
      return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
  };

  // ── PUT /:id ───────────────────────────────────────────────────────────
  // Modifie un post (body, image, hashtags) – uniquement par son auteur
  const editPost = async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Non connecte.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'ID de post invalide.' });
    }

    const { body, image, hashtags } = req.body;

    // Validation : corps obligatoire
    if (!body || !String(body).trim()) {
      return res.status(400).json({ success: false, message: 'Le texte du post est obligatoire.' });
    }
    if (String(body).trim().length > MAX_BODY_LENGTH) {
      return res.status(400).json({ success: false, message: `Le texte est trop long (max ${MAX_BODY_LENGTH} caractères).` });
    }

    try {
      const post = await Post.findById(id).lean();
      if (!post) {
        return res.status(404).json({ success: false, message: 'Post introuvable.' });
      }

      // Vérification d'autorisation : seul l'auteur peut modifier
      if (post.createdBy !== req.session.user.id) {
        return res.status(403).json({ success: false, message: 'Accès refusé.' });
      }

      const updatedPost = await Post.findByIdAndUpdate(
        id,
        {
          $set: {
            body: String(body).trim(),
            image: {
              url:   typeof image?.url   === 'string' ? image.url.substring(0, 500)   : (post.image?.url   || ''),
              title: typeof image?.title === 'string' ? image.title.substring(0, 200) : (post.image?.title || '')
            },
            hashtags: Array.isArray(hashtags)
              ? hashtags.slice(0, 20).map(h => String(h).substring(0, 50))
              : (post.hashtags || [])
          }
        },
        { new: true, lean: true }
      );

      const userMap = await fetchAuthors([updatedPost]);
      const enrichedPost = {
        ...updatedPost,
        user: userMap.get(updatedPost.createdBy) || null,
        comments: (updatedPost.comments || []).map(c => ({
          ...c,
          user: userMap.get(c.commentedBy) || null
        })),
        likedByUsers: (updatedPost.likedBy || []).map(uid => userMap.get(uid) || null).filter(Boolean)
      };

      return res.json({ success: true, post: enrichedPost });
    } catch (err) {
      console.error('Erreur PUT /:id :', err);
      return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
  };

  // ── DELETE /:id ────────────────────────────────────────────────────────
  // Supprime un post (uniquement par son auteur)
  const deletePost = async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Non connecte.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'ID de post invalide.' });
    }

    try {
      const post = await Post.findById(id).lean();
      if (!post) {
        return res.status(404).json({ success: false, message: 'Post introuvable.' });
      }

      // Vérification d'autorisation : seul l'auteur peut supprimer
      if (post.createdBy !== req.session.user.id) {
        return res.status(403).json({ success: false, message: 'Accès refusé.' });
      }

      await Post.findByIdAndDelete(id);
      return res.json({ success: true, message: 'Post supprimé.' });
    } catch (err) {
      console.error('Erreur DELETE /:id :', err);
      return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
  };

  // ── POST /:id/like ─────────────────────────────────────────────────────
  // Ajoute ou retire un like (toggle) – architecture prête pour Etape 5
  const toggleLike = async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Non connecte.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'ID de post invalide.' });
    }

    const userId = req.session.user.id;

    try {
      const post = await Post.findById(id);
      if (!post) {
        return res.status(404).json({ success: false, message: 'Post introuvable.' });
      }

      // Garantit que likedBy est toujours un tableau (anciens docs sans ce champ)
      if (!Array.isArray(post.likedBy)) post.likedBy = [];

      const alreadyLiked = post.likedBy.includes(userId);

      if (alreadyLiked) {
        // Retirer le like : $pull retire l'ID du tableau
        post.likedBy = post.likedBy.filter(uid => uid !== userId);
        post.likes = Math.max(0, (post.likes || 1) - 1);
      } else {
        // Ajouter le like
        post.likedBy.push(userId);
        post.likes = (post.likes || 0) + 1;
      }

      await post.save();

      // Enrichissement : noms des utilisateurs ayant liké
      let likedByUsers = [];
      if (post.likedBy.length > 0) {
        const result = await pool.query(
          'SELECT id, nom, prenom, pseudo FROM fredouil.compte WHERE id = ANY($1::int[])',
          [post.likedBy]
        );
        likedByUsers = result.rows;
      }

      // ── Notifications WebSocket temps réel ───────────────────────────
      // 1) Broadcast à TOUS les clients connectés : mise à jour du compteur
      if (io) {
        io.emit('post:updated', {
          postId:  id,
          type:    alreadyLiked ? 'unlike' : 'like',
          likes:   post.likes,
          likedBy: post.likedBy
        });
      }

      // 2) Notification ciblée au propriétaire du post (si connecté et différent du likeur)
      if (socketManager && io && post.createdBy !== userId) {
        const ownerSocketId = socketManager.getSocketIdByUserId(post.createdBy);
        if (ownerSocketId) {
          const actorNom = req.session.user.nom || 'Quelqu\'un';
          io.to(ownerSocketId).emit('notif:post_interaction', {
            type:     alreadyLiked ? 'unlike' : 'like',
            postId:   id,
            actorNom
          });
        }
      }

      return res.json({
        success: true,
        liked: !alreadyLiked,
        likes: post.likes,
        likedBy: post.likedBy,
        likedByUsers
      });
    } catch (err) {
      console.error('Erreur POST /:id/like :', err);
      return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
  };

  // ── PUT /:id/comment/:commentId ───────────────────────────────────────
  // Modifie le texte d'un commentaire
  //
  // Méthode d'autorisation : la vérification est intégrée dans la requête
  // MongoDB via $elemMatch { _id: commentId, commentedBy: session.user.id }.
  // Si l'utilisateur n'est pas l'auteur, findOneAndUpdate retourne null
  // sans modifier aucun document → atomique, pas de race condition.
  const editComment = async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Non connecte.' });
    }

    const { id, commentId } = req.params;

    // Validation des deux ObjectId
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: 'ID invalide.' });
    }

    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ success: false, message: 'Le commentaire ne peut pas être vide.' });
    }
    if (text.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ success: false, message: `Commentaire trop long (max ${MAX_COMMENT_LENGTH} caractères).` });
    }

    const now = new Date();
    const editedAt = now.toLocaleDateString('fr-FR') + ' '
      + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    try {
      // $elemMatch avec commentedBy intégré = vérification auteur atomique.
      // Si le commentaire n'appartient pas à l'utilisateur, null est retourné.
      const post = await Post.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(id),
          comments: {
            $elemMatch: {
              _id: new mongoose.Types.ObjectId(commentId),
              commentedBy: req.session.user.id   // Seul l'auteur peut modifier
            }
          }
        },
        {
          $set: {
            'comments.$.text':     text,
            'comments.$.edited':   true,
            'comments.$.editedAt': editedAt
          }
        },
        { new: true, lean: true }
      );

      if (!post) {
        // null = post inexistant, commentaire inexistant, ou auteur différent
        return res.status(403).json({ success: false, message: 'Commentaire introuvable ou accès refusé.' });
      }

      const userMap = await fetchAuthors([post]);
      const enrichedPost = {
        ...post,
        user: userMap.get(post.createdBy) || null,
        comments: (post.comments || []).map(c => ({
          ...c,
          user: userMap.get(c.commentedBy) || null
        }))
      };

      return res.json({ success: true, post: enrichedPost });
    } catch (err) {
      console.error('Erreur PUT /:id/comment/:commentId :', err);
      return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
  };

  // ── DELETE /:id/comment/:commentId ────────────────────────────────────
  // Supprime un commentaire
  //
  // Méthode d'autorisation : $pull avec { _id, commentedBy } intégrés.
  // MongoDB ne retire que si les deux conditions matchent → atomique.
  const deleteComment = async (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Non connecte.' });
    }

    const { id, commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: 'ID invalide.' });
    }

    try {
      // $pull avec commentedBy intégré = vérification auteur atomique
      const post = await Post.findByIdAndUpdate(
        id,
        {
          $pull: {
            comments: {
              _id: new mongoose.Types.ObjectId(commentId),
              commentedBy: req.session.user.id   // Seul l'auteur peut supprimer
            }
          }
        },
        { new: true, lean: true }
      );

      if (!post) {
        return res.status(404).json({ success: false, message: 'Post introuvable.' });
      }

      const userMap = await fetchAuthors([post]);
      const enrichedPost = {
        ...post,
        user: userMap.get(post.createdBy) || null,
        comments: (post.comments || []).map(c => ({
          ...c,
          user: userMap.get(c.commentedBy) || null
        }))
      };

      return res.json({ success: true, post: enrichedPost });
    } catch (err) {
      console.error('Erreur DELETE /:id/comment/:commentId :', err);
      return res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
  };

  return {
    getPosts,
    createPost,
    addComment,
    editComment,
    deleteComment,
    deletePost,
    editPost,
    toggleLike
  };
};

module.exports = createPostController;

