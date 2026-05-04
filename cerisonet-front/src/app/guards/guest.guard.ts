import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

// Empêche l'accès à /login si l'utilisateur est déjà connecté.
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn) {
    return router.createUrlTree(['/wall']);
  }

  return auth.checkSession().pipe(
    map((user) => (user ? router.createUrlTree(['/wall']) : true))
  );
};
