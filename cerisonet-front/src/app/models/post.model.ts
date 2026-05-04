// ── Options de tri disponibles pour le mur (Etape 4) ─────────────────────
export type SortOption = 'date_desc' | 'date_asc' | 'likes_desc';

export interface PostUser {
  id: number;
  nom: string;
  prenom?: string;
  pseudo?: string;
}

export interface PostImage {
  url: string;
  title: string;
}

export interface PostComment {
  _id?: string;
  commentedBy: number;
  text: string;
  date: string;
  hour: string;
  user?: PostUser | null;
  edited?: boolean;    // true si le commentaire a été modifié (Etape 4)
  editedAt?: string;   // date+heure de la dernière modification
}

export interface PostItem {
  _id: string;
  body?: string;
  createdBy: number;
  hashtags?: string[];
  image?: PostImage;
  images?: PostImage;
  likes?: number;
  likedBy?: number[];        // Tableau des IDs ayant liké (Etape 4)
  likedByUsers?: PostUser[]; // Noms des utilisateurs ayant liké
  date?: string;
  hour?: string;
  comments?: PostComment[];
  shared?: string | null;
  Shared?: string | null;
  sharedPost?: PostItem | null;  // Post original embed\u00e9 lors d'un repartage
  user?: PostUser | null;
}

export interface SessionUser {
  id?: number;
  email: string;
  nom: string;
  loginAt?: string;
}

export interface GetPostsResponse {
  success: boolean;
  posts: PostItem[];
  user?: SessionUser;
  message?: string;
  nextCursor?: string | null;  // Curseur de pagination retourné par l'API (Etape 4)
}

export interface CreatePostPayload {
  body: string;
  image?: PostImage;
  hashtags?: string[];
  shared?: string | null;
}

export interface CreatePostResponse {
  success: boolean;
  post?: PostItem;
  message?: string;
}

// ── Types Etape 4 ────────────────────────────────────────────────────────

export interface AddCommentPayload {
  text: string;
}

// Réponse commune pour add/edit/delete commentaire
export interface CommentActionResponse {
  success: boolean;
  post?: PostItem;
  message?: string;
}

export interface EditCommentPayload {
  text: string;
}

// Payload pour modifier un post
export interface EditPostPayload {
  body: string;
  image?: PostImage;
  hashtags?: string[];
}

// Réponse de l'édition d'un post
export interface EditPostResponse {
  success: boolean;
  post?: PostItem;
  message?: string;
}

// Alias conservé pour compatibilité
export type AddCommentResponse = CommentActionResponse;

export interface ToggleLikeResponse {
  success: boolean;
  liked?: boolean;          // true si like ajouté, false si retiré
  likes?: number;
  likedBy?: number[];
  likedByUsers?: PostUser[]; // Noms des utilisateurs ayant liké
  message?: string;
}
