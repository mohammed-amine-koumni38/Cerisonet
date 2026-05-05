// Composant de connexion: formulaire de login
// Etapes: (1) Vérification, (2) Notification, (3) LocalStorage, (4) Navigation vers wall
// Etape 5: Connexion WebSocket après login réussi
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotifService } from '../../services/notif.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  login    = '';         // Email/identifiant saisi par l'utilisateur
  password = '';         // Mot de passe saisi par l'utilisateur
  lastLogin = '';        // (3) Date et heure de la connexion précédente (depuis LocalStorage)

  private auth   = inject(AuthService);
  private notif  = inject(NotifService);
  private router = inject(Router);
  private socket = inject(SocketService);

  ngOnInit(): void {
    // (3) Lecture de la connexion précédente (si elle existe)
    this.lastLogin = localStorage.getItem('previousLogin') || '';
  }

  // Traitement du formulaire de connexion
  onSubmit(): void {
    // (1) Envoie les identifiants au serveur pour vérification
    this.auth.login(this.login, this.password).subscribe({
      next: (data) => {
        if (data.success) {
          // (3) Conserve l'ancienne connexion comme "dernière connexion"
          const previous = localStorage.getItem('lastLogin');
          if (previous) {
            localStorage.setItem('previousLogin', previous);
          }

          // (3) Enregistre la connexion courante
          const now = new Date().toLocaleString('fr-FR');
          localStorage.setItem('lastLogin', now);
          // Stockage de l'utilisateur dans le service
          this.auth.setUser(data.user);
          // Etape 5 : Connexion WebSocket après login réussi
          // Le cookie de session est disponible à ce moment → Socket.IO
          // peut le lire lors du handshake pour identifier l'utilisateur.
          this.socket.connect();
          // (2) Affichage du message de succès dans le bandeau de notification
          this.notif.show(data.message, 'success');
          // (4) Navigation vers le mur d'accueil
          this.router.navigate(['/wall']);
        } else {
          // (2) Affichage du message d'erreur
          this.notif.show(data.message, 'error');
        }
      },
      error: (err) => {
        // Gestion des erreurs réseau
        const msg = err.error?.message || 'Erreur réseau.';
        this.notif.show(msg, 'error');
      }
    });
  }
}
