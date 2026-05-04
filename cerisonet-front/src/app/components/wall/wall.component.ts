// Composant du mur d'accueil – Etape 4
// Tri, filtres, commentaires, likes, suppression
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotifService } from '../../services/notif.service';
import { User } from '../../models/user.model';
import { PostItem, PostUser, PostComment, SortOption, EditPostPayload } from '../../models/post.model';
import { PostService } from '../../services/post.service';

@Component({
  selector: 'app-wall',
  imports: [FormsModule],
  templateUrl: './wall.component.html',
  styleUrl: './wall.component.css'
})
export class WallComponent implements OnInit {
  user: User | null = null;        // Informations de l'utilisateur connecté
  lastLogin = '';                  // Date et heure de la connexion précédente
  posts: PostItem[] = [];
  loadingPosts = false;
  loadingMore = false;
  creatingPost = false;
  hasMore = true;

  postBody = '';
  postImageUrl = '';
  postImageTitle = '';
  postHashtagsInput = '';

  // ── Etape 4 : tri et filtres ─────────────────────────────────────────
  sortBy: SortOption = 'date_desc';   // Tri actif
  filterHashtag = '';                  // Filtre hashtag actif

  // ── Etape 4 : commentaires (map postId -> texte en cours de saisie) ──
  commentTexts: Record<string, string> = {};
  submittingComment: Record<string, boolean> = {};

  // ── Édition de commentaires (map commentId -> texte en cours) ──
  editingComments: Record<string, string> = {};    // commentId -> texte édité
  savingEditComment: Record<string, boolean> = {}; // commentId -> en cours de sauvegarde
  deletingComment: Record<string, boolean> = {};   // commentId -> en cours de suppression

  // ── Édition de posts (map postId -> données en cours d'édition) ────────
  editingPosts: Record<string, { body: string; imageUrl: string; imageTitle: string; hashtagsInput: string }> = {};
  savingEditPost: Record<string, boolean> = {};

  // ── Partage de posts ─────────────────────────────────────────
  sharingPost: Record<string, string> = {};       // postId → corps saisi
  submittingShare: Record<string, boolean> = {};  // postId → en cours d'envoi

  private cursor: string | null = null;

  private auth   = inject(AuthService);
  private notif  = inject(NotifService);
  private router = inject(Router);
  private postService = inject(PostService);

  ngOnInit(): void {
    // Récupération des informations utilisateur depuis le service
    this.auth.currentUser$.subscribe(u => this.user = u);
    // (3) Récupération de la connexion précédente depuis LocalStorage
    this.lastLogin = localStorage.getItem('previousLogin') || '';

    this.fetchPosts(true);
  }

  fetchPosts(reset = false): void {
    if (reset) {
      this.loadingPosts = true;
      this.posts = [];
      this.cursor = null;
      this.hasMore = true;
    } else {
      if (!this.hasMore || this.loadingMore) {
        return;
      }
      this.loadingMore = true;
    }

    // Passage du tri et du filtre à chaque requête (Etape 4)
    this.postService.getPosts(
      10,
      reset ? undefined : this.cursor || undefined,
      this.sortBy,
      this.filterHashtag.trim() || undefined
    ).subscribe({
      next: (response) => {
        if (!response.success) {
          this.notif.show(response.message || 'Impossible de récupérer les posts.', 'error');
          return;
        }

        if (response.user && !this.user) {
          this.auth.setUser(response.user);
        }

        const incoming = response.posts || [];
        this.posts = reset ? incoming : [...this.posts, ...incoming];

        // Utilise le nextCursor retourné par l'API (Etape 4)
        this.cursor = response.nextCursor ?? null;
        this.hasMore = response.nextCursor != null;
      },
      error: (err) => {
        const message = err.error?.message || 'Erreur réseau pendant le chargement des posts.';
        this.notif.show(message, 'error');
      },
      complete: () => {
        this.loadingPosts = false;
        this.loadingMore = false;
      }
    });
  }

  submitPost(): void {
    const body = this.postBody.trim();
    if (!body) {
      this.notif.show('Le texte du post est obligatoire.', 'error');
      return;
    }

    const hashtags = this.normalizeHashtags(this.postHashtagsInput);
    const url = this.postImageUrl.trim();
    const title = this.postImageTitle.trim();

    const payload: {
      body: string;
      image?: { url: string; title: string };
      hashtags: string[];
      shared: null;
    } = {
      body,
      hashtags,
      shared: null
    };

    if (url || title) {
      payload.image = { url, title };
    }

    this.creatingPost = true;
    this.postService.createPost(payload).subscribe({
      next: (response) => {
        if (!response.success) {
          this.notif.show(response.message || 'Création du post impossible.', 'error');
          return;
        }

        // Le post créé ne contient pas toujours les données enrichies, on force un refresh.
        this.postBody = '';
        this.postImageUrl = '';
        this.postImageTitle = '';
        this.postHashtagsInput = '';

        this.notif.show('Post publié avec succès.', 'success');
        this.fetchPosts(true);
      },
      error: (err) => {
        const message = err.error?.message || 'Erreur réseau pendant la création du post.';
        this.notif.show(message, 'error');
      },
      complete: () => {
        this.creatingPost = false;
      }
    });
  }

  // ── Etape 4 : appliquer tri/filtre (reset + reload) ────────────────
  applyFilters(): void {
    this.fetchPosts(true);
  }

  // ── Etape 4 : ajouter un commentaire ─────────────────────────────────
  addComment(postId: string): void {
    const text = (this.commentTexts[postId] || '').trim();
    if (!text) {
      this.notif.show('Le commentaire ne peut pas être vide.', 'error');
      return;
    }

    this.submittingComment[postId] = true;
    this.postService.addComment(postId, { text }).subscribe({
      next: (response) => {
        if (!response.success) {
          this.notif.show(response.message || 'Impossible d\'ajouter le commentaire.', 'error');
          return;
        }
        // Mise à jour locale du post (sans recharger tous les posts)
        const idx = this.posts.findIndex(p => p._id === postId);
        if (idx !== -1 && response.post) {
          // Préserve sharedPost (non inclus dans la réponse addComment)
          this.posts[idx] = { ...response.post, sharedPost: this.posts[idx].sharedPost };
        }
        this.notif.show('Commentaire ajouté.', 'success');
      },
      error: (err) => {
        const message = err.error?.message || 'Erreur réseau lors de l\'ajout du commentaire.';
        this.notif.show(message, 'error');
      },
      complete: () => {
        this.submittingComment[postId] = false;
      }
    });
  }

  // ── Etape 4 : supprimer un post (propriétaire uniquement) ─────────────
  deletePost(postId: string): void {
    if (!confirm('Supprimer ce post définitivement ?')) {
      return;
    }

    this.postService.deletePost(postId).subscribe({
      next: (response) => {
        if (!response.success) {
          this.notif.show(response.message || 'Impossible de supprimer le post.', 'error');
          return;
        }
        // Retrait local immédiat sans recharger
        this.posts = this.posts.filter(p => p._id !== postId);
        this.notif.show('Post supprimé.', 'success');
      },
      error: (err) => {
        const message = err.error?.message || 'Erreur réseau lors de la suppression.';
        this.notif.show(message, 'error');
      }
    });
  }

  // ── Etape 4 : like / unlike toggle ───────────────────────────────────
  toggleLike(post: PostItem): void {
    this.postService.toggleLike(post._id).subscribe({
      next: (response) => {
        if (!response.success) {
          this.notif.show(response.message || 'Impossible de liker le post.', 'error');
          return;
        }
        // Mise à jour locale optimiste
        const idx = this.posts.findIndex(p => p._id === post._id);
        if (idx !== -1) {
          this.posts[idx] = {
            ...this.posts[idx],
            likes: response.likes ?? this.posts[idx].likes,
            likedBy: response.likedBy ?? this.posts[idx].likedBy,
            likedByUsers: response.likedByUsers ?? this.posts[idx].likedByUsers
          };
        }
      },
      error: (err) => {
        const message = err.error?.message || 'Erreur réseau lors du like.';
        this.notif.show(message, 'error');
      }
    });
  }

  // ── Partage de post ───────────────────────────────────────────────────

  // Un repost est un post qui a lui-même un shared (évite les reposts de reposts)
  isRepost(post: PostItem): boolean {
    return !!post.shared;
  }

  isSharing(postId: string): boolean {
    return postId in this.sharingPost;
  }

  startShare(postId: string): void {
    this.sharingPost[postId] = '';
  }

  cancelShare(postId: string): void {
    delete this.sharingPost[postId];
  }

  submitShare(post: PostItem): void {
    // Corps optionnel : message par défaut si vide
    const body = (this.sharingPost[post._id] || '').trim() || 'Post partagé.';

    this.submittingShare[post._id] = true;
    this.postService.createPost({ body, shared: post._id, hashtags: [] }).subscribe({
      next: (response) => {
        if (!response.success) {
          this.notif.show(response.message || 'Impossible de partager le post.', 'error');
          return;
        }
        delete this.sharingPost[post._id];
        this.notif.show('Post partagé !', 'success');
        this.fetchPosts(true);
      },
      error: (err) => {
        const message = err.error?.message || 'Erreur réseau lors du partage.';
        this.notif.show(message, 'error');
      },
      complete: () => {
        this.submittingShare[post._id] = false;
      }
    });
  }

  // ── Édition de post ───────────────────────────────────────────────────

  isEditingPost(postId: string): boolean {
    return postId in this.editingPosts;
  }

  startEditPost(post: PostItem): void {
    const image = post.image || post.images;
    this.editingPosts[post._id] = {
      body: post.body || '',
      imageUrl: image?.url || '',
      imageTitle: image?.title || '',
      hashtagsInput: (post.hashtags || []).join(' ')
    };
  }

  cancelEditPost(postId: string): void {
    delete this.editingPosts[postId];
  }

  saveEditPost(postId: string): void {
    const draft = this.editingPosts[postId];
    if (!draft) return;

    const body = draft.body.trim();
    if (!body) {
      this.notif.show('Le texte du post est obligatoire.', 'error');
      return;
    }

    const payload: EditPostPayload = {
      body,
      image: { url: draft.imageUrl.trim(), title: draft.imageTitle.trim() },
      hashtags: this.normalizeHashtags(draft.hashtagsInput)
    };

    this.savingEditPost[postId] = true;
    this.postService.editPost(postId, payload).subscribe({
      next: (response) => {
        if (!response.success) {
          this.notif.show(response.message || 'Impossible de modifier le post.', 'error');
          return;
        }
        const idx = this.posts.findIndex(p => p._id === postId);
        if (idx !== -1 && response.post) {
          // Préserve sharedPost (non inclus dans la réponse editPost)
          this.posts[idx] = { ...response.post, sharedPost: this.posts[idx].sharedPost };
        }
        delete this.editingPosts[postId];
        this.notif.show('Post modifié.', 'success');
      },
      error: (err) => {
        const message = err.error?.message || 'Erreur réseau lors de la modification.';
        this.notif.show(message, 'error');
      },
      complete: () => {
        this.savingEditPost[postId] = false;
      }
    });
  }

  // Vérifie si l'utilisateur connecté est l'auteur du post
  isOwner(post: PostItem): boolean {
    return !!this.user?.id && post.createdBy === this.user.id;
  }

  // Vérifie si l'utilisateur connecté a déjà liké le post
  isLiked(post: PostItem): boolean {
    return !!this.user?.id && (post.likedBy || []).includes(this.user.id);
  }

  // Retourne une chaîne listant les noms des utilisateurs ayant liké
  // Exemple : "Alice, Bob" ou "Alice, Bob et 3 autres"
  getLikedByNames(post: PostItem): string {
    const users = post.likedByUsers || [];
    if (users.length === 0) return '';
    const MAX_SHOWN = 3;
    const shown = users.slice(0, MAX_SHOWN).map(u => u.nom);
    const rest = users.length - MAX_SHOWN;
    if (rest > 0) {
      return shown.join(', ') + ` et ${rest} autre${rest > 1 ? 's' : ''}`;
    }
    return shown.join(', ');
  }

  // Vérifie si l'utilisateur connecté est l'auteur du commentaire
  isCommentOwner(comment: PostComment): boolean {
    return !!comment._id && !!this.user?.id && comment.commentedBy === this.user.id;
  }

  // Vérifie si un commentaire est en cours d'édition
  isEditingComment(commentId: string): boolean {
    return commentId in this.editingComments;
  }

  // Active le mode édition : charge le texte actuel dans l'état
  startEditComment(comment: PostComment): void {
    if (comment._id) {
      this.editingComments[comment._id] = comment.text;
    }
  }

  // Annule l'édition sans sauvegarder
  cancelEditComment(commentId: string): void {
    delete this.editingComments[commentId];
  }

  // Sauvegarde la modification d'un commentaire
  saveEditComment(postId: string, comment: PostComment): void {
    if (!comment._id) return;
    const text = (this.editingComments[comment._id] || '').trim();
    if (!text) {
      this.notif.show('Le commentaire ne peut pas être vide.', 'error');
      return;
    }

    this.savingEditComment[comment._id] = true;
    this.postService.editComment(postId, comment._id, { text }).subscribe({
      next: (response) => {
        if (!response.success) {
          this.notif.show(response.message || 'Impossible de modifier le commentaire.', 'error');
          return;
        }
        // Mise à jour locale du post sans recharger la liste
        const idx = this.posts.findIndex(p => p._id === postId);
        if (idx !== -1 && response.post) {
          // Préserve sharedPost (non inclus dans la réponse editComment)
          this.posts[idx] = { ...response.post, sharedPost: this.posts[idx].sharedPost };
        }
        const cid = comment._id!;
        delete this.editingComments[cid];
        this.notif.show('Commentaire modifié.', 'success');
      },
      error: (err) => {
        const message = err.error?.message || 'Erreur réseau lors de la modification.';
        this.notif.show(message, 'error');
      },
      complete: () => {
        if (comment._id) this.savingEditComment[comment._id] = false;
      }
    });
  }

  // Supprime un commentaire (propriétaire uniquement, vérification côté serveur)
  deleteComment(postId: string, commentId: string): void {
    if (!confirm('Supprimer ce commentaire définitivement ?')) return;

    this.deletingComment[commentId] = true;
    this.postService.deleteComment(postId, commentId).subscribe({
      next: (response) => {
        if (!response.success) {
          this.notif.show(response.message || 'Impossible de supprimer le commentaire.', 'error');
          return;
        }
        const idx = this.posts.findIndex(p => p._id === postId);
        if (idx !== -1 && response.post) {
          // Préserve sharedPost (non inclus dans la réponse deleteComment)
          this.posts[idx] = { ...response.post, sharedPost: this.posts[idx].sharedPost };
        }
        this.notif.show('Commentaire supprimé.', 'success');
      },
      error: (err) => {
        const message = err.error?.message || 'Erreur réseau lors de la suppression.';
        this.notif.show(message, 'error');
      },
      complete: () => {
        this.deletingComment[commentId] = false;
      }
    });
  }

  getDisplayName(user?: PostUser | null): string {
    if (!user) {
      return 'Utilisateur inconnu';
    }

    if (user.pseudo && user.pseudo.trim()) {
      return user.pseudo;
    }

    const fullName = `${user.prenom || ''} ${user.nom || ''}`.trim();
    return fullName || 'Utilisateur';
  }

  getPostImage(post: PostItem): { url: string; title: string } | null {
    const image = post.image || post.images;
    if (!image || !image.url) {
      return null;
    }

    return image;
  }

  private normalizeHashtags(rawValue: string): string[] {
    return rawValue
      .split(/[\s,;]+/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
  }

  // Fonction de déconnexion
  logout(): void {
    // Envoie une requête de déconnexion au serveur
    this.auth.logout().subscribe(() => {
      // Efface les données utilisateur côté client
      this.auth.clearUser();
      // (2) Affichage du message de déconnexion
      this.notif.show('Vous avez été déconnecté.', 'success');
      // Redirection vers la page de connexion
      this.router.navigate(['/login']);
    });
  }
}
