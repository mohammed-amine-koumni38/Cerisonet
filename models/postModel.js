const mongoose = require('mongoose');

const commentSchema = mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true
    },
    commentedBy: {
      type: Number,
      required: true
    },
    date: {
      type: String,
      required: true
    },
    hour: {
      type: String,
      required: true
    },
    // Etape 4 : traçabilité des modifications de commentaires
    edited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: String,
      default: ''
    }
  }
  // _id: true par défaut — obligatoire pour identifier chaque commentaire (edit/delete)
);

const postSchema = mongoose.Schema({
  date: {
    type: String,
    required: true
  },
  hour: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true,
    trim: true
  },
  createdBy: {
    type: Number,
    required: true
  },
  // "image" pour les nouveaux posts, "images" pour la compatibilité avec les anciens documents
  image: {
    url:   { type: String, default: '' },
    title: { type: String, default: '' }
  },
  images: {
    url:   { type: String, default: '' },
    title: { type: String, default: '' }
  },
  likes: {
    type: Number,
    default: 0
  },
  // Tableau des IDs utilisateurs ayant liké le post (Etape 4)
  likedBy: {
    type: [Number],
    default: []
  },
  // Compteur de partages (Etape 5 : temps réel)
  shares: {
    type: Number,
    default: 0
  },
  hashtags: {
    type: [String],
    default: []
  },
  comments: {
    type: [commentSchema],
    default: []
  },
  shared: {
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'Post',
    default: null
  }
}, {
  collection: 'CERISoNet'
});

const Post = mongoose.model('Post', postSchema);

module.exports = Post;
