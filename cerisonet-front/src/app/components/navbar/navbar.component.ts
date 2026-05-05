// ========================================
// COMPOSANT NAVBAR
// Barre de navigation avec cloche de notifications
// ========================================
import {
  Component,
  inject,
  Input,
  OnDestroy,
  OnInit,
  HostListener
} from '@angular/core';
import { AsyncPipe, DatePipe, NgClass } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { NotifBellService, AppNotif } from '../../services/notif-bell.service';
import { Subscription } from 'rxjs';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [AsyncPipe, NgClass, DatePipe],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit, OnDestroy {

  @Input() user: User | null = null;

  // Panneau ouvert ou fermé
  panelOpen = false;

  readonly notifications$ = inject(NotifBellService).notifications$;
  readonly unreadCount$   = inject(NotifBellService).unreadCount$;

  private notifBell = inject(NotifBellService);
  private socket    = inject(SocketService);
  private auth      = inject(AuthService);
  private router    = inject(Router);
  private subs: Subscription[] = [];

  ngOnInit(): void {
    // ── Ecoute des notifications Socket.IO ─────────────────────────────

    // Connexion d'un utilisateur
    this.subs.push(
      this.socket.onUserConnected$.subscribe(e => {
        this.notifBell.push({
          type: 'connected',
          message: `${e.nom} vient de se connecter`
        });
      })
    );

    // Déconnexion d'un utilisateur
    this.subs.push(
      this.socket.onUserDisconnected$.subscribe(e => {
        this.notifBell.push({
          type: 'disconnected',
          message: `${e.nom} vient de se déconnecter`
        });
      })
    );

    // Interaction sur un post dont on est propriétaire
    this.subs.push(
      this.socket.onPostInteraction$.subscribe(e => {
        const msgs: Record<string, string> = {
          like:    `${e.actorNom} a aimé votre post`,
          unlike:  `${e.actorNom} n'aime plus votre post`,
          comment: `${e.actorNom} a commenté votre post`,
          share:   `${e.actorNom} a partagé votre post`
        };
        this.notifBell.push({
          type:     e.type as AppNotif['type'],
          message:  msgs[e.type] ?? `${e.actorNom} a interagi avec votre post`,
          postId:   e.postId,
          actorNom: e.actorNom
        });
      })
    );
  }

  // Ouvre/ferme le panneau et marque tout comme lu à l'ouverture
  togglePanel(): void {
    this.panelOpen = !this.panelOpen;
    if (this.panelOpen) {
      this.notifBell.markAllRead();
    }
  }

  // Ferme le panneau si on clique en dehors
  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.navbar-notif-wrapper')) {
      this.panelOpen = false;
    }
  }

  logout(): void {
    this.socket.disconnect();
    this.notifBell.clear();
    this.auth.logout().subscribe(() => {
      this.auth.clearUser();
      this.router.navigate(['/login']);
    });
  }

  // Icône selon le type
  iconFor(type: AppNotif['type']): string {
    const icons: Record<string, string> = {
      like:         '❤️',
      unlike:       '💔',
      comment:      '💬',
      share:        '🔁',
      connected:    '🟢',
      disconnected: '🔴'
    };
    return icons[type] ?? '🔔';
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
