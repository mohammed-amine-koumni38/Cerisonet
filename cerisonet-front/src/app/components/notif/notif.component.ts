// Composant de bandeau de notification
// (2) Affiche les messages de succès ou d'erreur à l'utilisateur
import { Component, inject } from '@angular/core';
import { AsyncPipe, NgClass } from '@angular/common';
import { NotifService } from '../../services/notif.service';

@Component({
  selector: 'app-notif',
  imports: [AsyncPipe, NgClass],
  templateUrl: './notif.component.html',
  styleUrl: './notif.component.css'
})
export class NotifComponent {
  // Observable qui contient l'information de notification courante
  // AsyncPipe dans le template se charge de souscrire automatiquement
  notif$ = inject(NotifService).notif$;
}
