// ========================================
// SERVICE CLOCHE DE NOTIFICATIONS
// Stocke les notifications reçues en temps réel
// et expose le compteur de non-lues.
// ========================================
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface AppNotif {
  id: string;           // identifiant unique (timestamp + random)
  type: 'like' | 'unlike' | 'comment' | 'share' | 'connected' | 'disconnected';
  message: string;      // texte affiché dans le panneau
  postId?: string;      // si lié à un post (pour le scroll futur)
  actorNom?: string;
  read: boolean;        // false = point bleu
  at: Date;             // heure de réception
}

@Injectable({ providedIn: 'root' })
export class NotifBellService {

  // Liste complète des notifications (max 50 conservées)
  private notifs$ = new BehaviorSubject<AppNotif[]>([]);
  readonly notifications$ = this.notifs$.asObservable();

  // Nombre de notifications non lues
  private unread$ = new BehaviorSubject<number>(0);
  readonly unreadCount$ = this.unread$.asObservable();

  // Ajoute une notification en tête de liste
  push(notif: Omit<AppNotif, 'id' | 'read' | 'at'>): void {
    const current = this.notifs$.value;
    const newNotif: AppNotif = {
      ...notif,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      read: false,
      at: new Date()
    };
    // Conserve max 50 notifications
    const updated = [newNotif, ...current].slice(0, 50);
    this.notifs$.next(updated);
    this.unread$.next(updated.filter(n => !n.read).length);
  }

  // Marque toutes comme lues (ouverture du panneau)
  markAllRead(): void {
    const updated = this.notifs$.value.map(n => ({ ...n, read: true }));
    this.notifs$.next(updated);
    this.unread$.next(0);
  }

  // Vide la liste
  clear(): void {
    this.notifs$.next([]);
    this.unread$.next(0);
  }
}
