// Point d'entrée principal de l'application Angular
// Initialise et démarre l'application avec la configuration définie dans app.config
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Lancement de l'application Angular avec le composant racine (AppComponent)
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
