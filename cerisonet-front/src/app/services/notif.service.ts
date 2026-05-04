// Service de notification: affiche des messages temporaires à l'utilisateur
// (2) Bandeau de notification réutilisable pour toutes les notifications
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Interface définissant la structure d'une notification
export interface Notif {
  message: string;                        // Texte du message
  type: 'success' | 'error' | '';        // Type: succès ou erreur
  visible: boolean;                       // Visibilité du bandeau
}

@Injectable({ providedIn: 'root' })
export class NotifService {
  // Observable stocké pour partager l'état des notifications avec les composants
  private state$ = new BehaviorSubject<Notif>({ message: '', type: '', visible: false });
  notif$ = this.state$.asObservable();

  // Affiche un message de notification pendant 5 secondes
  show(message: string, type: 'success' | 'error'): void {
    this.state$.next({ message, type, visible: true });
    // Masque automatiquement la notification après 5 secondes
    setTimeout(() => this.state$.next({ message: '', type: '', visible: false }), 5000);
  }
}
