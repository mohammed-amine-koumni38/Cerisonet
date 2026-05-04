// Composant racine de l'application
// Affiche le bandeau de notifications et la zone de contenu principal (routing)
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotifComponent } from './components/notif/notif.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NotifComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {}
// AppComponent contient:
// - NotifComponent: bandeau pour afficher les messages de notification
// - RouterOutlet: zone où les composants des routes s'affichent (login, wall)
