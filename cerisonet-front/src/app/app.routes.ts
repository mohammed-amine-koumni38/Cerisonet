// Définition des routes de l'application
// Gère la navigation entre les pages (login et wall)
import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { WallComponent } from './components/wall/wall.component';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';

export const routes: Routes = [
  // Route racine: redirection vers la page de connexion
  { path: '',      redirectTo: 'login', pathMatch: 'full' },
  // Route /login: accessible uniquement si l'utilisateur n'est pas connecté
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  // Route /wall: affiche le mur d'accueil, protégé par le garde d'authentification
  { path: 'wall',  component: WallComponent, canActivate: [authGuard] },
];
