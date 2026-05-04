// Garde d'authentification: protège les routes privées
// Vérifie si l'utilisateur est connecté avant d'accéder à une page protégée
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Si déjà en mémoire côté Angular, autorise immédiatement.
  if (auth.isLoggedIn) {
    return true;
  }

  // Sinon, vérifie la session serveur (cas refresh de page).
  return auth.checkSession().pipe(
    map((user) => (user ? true : router.createUrlTree(['/login'])))
  );
};
