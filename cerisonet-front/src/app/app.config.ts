// Configuration de l'application Angular
// Définit les fournisseurs (providers) nécessaires au fonctionnement de l'app
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // Optimise la détection des changements avec coalescence d'événements
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Fournit le routeur avec les routes définies
    provideRouter(routes),
    // Fournit HttpClient pour les requêtes HTTP (communication avec le serveur)
    provideHttpClient()
  ]
};
