// ========================================
// SERVICE WEBSOCKET – Socket.IO Client
// Etape 5 : Communication temps réel
//
// Responsabilités :
//   - Connexion / déconnexion au serveur Socket.IO
//   - Ecoute des événements réseau (connexion/déco utilisateurs)
//   - Ecoute des interactions sur les posts (likes, commentaires, partages)
//   - Exposition via Observables RxJS
// ========================================

import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject, Observable } from 'rxjs';

// ── Interfaces des événements reçus ──────────────────────────────────────

/** Notification de connexion/déconnexion d'un autre utilisateur */
export interface UserConnectionEvent {
  nom: string;
}

/**
 * Notification d'interaction sur un post dont l'utilisateur est propriétaire.
 * Exemples : "Ahmed a liké votre post", "Sarah a commenté votre post"
 */
export interface PostInteractionEvent {
  /** 'like' | 'unlike' | 'comment' | 'share' */
  type: string;
  postId: string;
  actorNom: string;
}

/** Mise à jour broadcast des compteurs d'un post (visible par tous) */
export interface PostUpdatedEvent {
  postId: string;
  /** 'like' | 'unlike' | 'share' */
  type: string;
  likes?: number;
  likedBy?: number[];
  shares?: number;
}

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {

  // Instance Socket.IO : null tant que connect() n'a pas été appelé
  private socket: Socket | null = null;

  // ── Subjects RxJS internes (émetteurs) ────────────────────────────────
  private userConnected$    = new Subject<UserConnectionEvent>();
  private userDisconnected$ = new Subject<UserConnectionEvent>();
  private postInteraction$  = new Subject<PostInteractionEvent>();
  private postUpdated$      = new Subject<PostUpdatedEvent>();

  // ── Observables publics exposés aux composants ────────────────────────

  /** Emet quand un autre utilisateur vient de se connecter */
  get onUserConnected$(): Observable<UserConnectionEvent> {
    return this.userConnected$.asObservable();
  }

  /** Emet quand un autre utilisateur vient de se déconnecter */
  get onUserDisconnected$(): Observable<UserConnectionEvent> {
    return this.userDisconnected$.asObservable();
  }

  /**
   * Emet quand quelqu'un interagit avec un post dont l'utilisateur est propriétaire.
   * (like, commentaire, partage)
   */
  get onPostInteraction$(): Observable<PostInteractionEvent> {
    return this.postInteraction$.asObservable();
  }

  /**
   * Emet quand les compteurs d'un post sont mis à jour en temps réel.
   * Permet de rafraîchir l'affichage pour TOUS les utilisateurs connectés.
   */
  get onPostUpdated$(): Observable<PostUpdatedEvent> {
    return this.postUpdated$.asObservable();
  }

  // ── Connexion au serveur Socket.IO ────────────────────────────────────

  /**
   * Ouvre la connexion WebSocket.
   * A appeler après un login réussi.
   *
   * En production  : le serveur HTTPS sert aussi Socket.IO (même origine).
   * En dev (ng serve 4200) : le proxy redirige /socket.io vers localhost:3197.
   */
  connect(): void {
    // Evite les connexions dupliquées : si le socket existe déjà (même en cours
    // de connexion), on ne crée pas un second socket.
    // Avant la correction, on testait only .connected (false pendant le handshake)
    // ce qui créait un 2ème socket à chaque navigation vers /wall.
    if (this.socket) {
      return;
    }

    // Récupère le port depuis l'URL courante pour fonctionner en prod comme en dev
    const serverUrl = window.location.origin;

    this.socket = io(serverUrl, {
      // Indispensable : envoie le cookie de session dans le handshake WebSocket
      // → le serveur peut ainsi lire req.session.user
      withCredentials: true,
      // Privilégie WebSocket, tombe sur long-polling en cas d'incompatibilité
      transports: ['websocket', 'polling']
    });

    // ── Enregistrement des listeners d'événements ──────────────────────

    // Connexion établie (log de debug)
    this.socket.on('connect', () => {
      console.log('[Socket] Connecté :', this.socket?.id);
    });

    // Déconnexion (log de debug)
    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Déconnecté :', reason);
    });

    // ── Evénements de présence ─────────────────────────────────────────

    /** Un autre utilisateur vient de se connecter */
    this.socket.on('notif:user_connected', (data: UserConnectionEvent) => {
      this.userConnected$.next(data);
    });

    /** Un autre utilisateur vient de se déconnecter */
    this.socket.on('notif:user_disconnected', (data: UserConnectionEvent) => {
      this.userDisconnected$.next(data);
    });

    // ── Evénements d'interactions sur les posts ────────────────────────

    /**
     * Notification personnelle : quelqu'un a liké/commenté/partagé un post
     * dont l'utilisateur connecté est propriétaire.
     */
    this.socket.on('notif:post_interaction', (data: PostInteractionEvent) => {
      this.postInteraction$.next(data);
    });

    /**
     * Mise à jour broadcast d'un post (likes, partages) visible par tous.
     * Permet de mettre à jour les compteurs sans rechargement.
     */
    this.socket.on('post:updated', (data: PostUpdatedEvent) => {
      this.postUpdated$.next(data);
    });
  }

  // ── Déconnexion ───────────────────────────────────────────────────────

  /**
   * Ferme la connexion WebSocket côté client.
   * A appeler lors du logout ou destruction du service.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /** Nettoyage automatique à la destruction du service (Angular lifecycle) */
  ngOnDestroy(): void {
    this.disconnect();
    this.userConnected$.complete();
    this.userDisconnected$.complete();
    this.postInteraction$.complete();
    this.postUpdated$.complete();
  }
}
