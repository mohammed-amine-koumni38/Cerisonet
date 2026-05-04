// Service d'authentification: gère la connexion et l'état de l'utilisateur
// (1) Vérification et stockage de session côté client
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  // Observable qui contient l'utilisateur actuellement connecté
  private user$ = new BehaviorSubject<User | null>(null);
  currentUser$ = this.user$.asObservable();

  // Vérifie si un utilisateur est connecté
  get isLoggedIn(): boolean {
    return this.user$.value !== null;
  }

  // Envoie les identifiants au serveur pour vérfication
  // Le serveur crée une session MongoDB si les identifiants sont corrects
  login(login: string, password: string): Observable<any> {
    return this.http.post<any>('/auth/login', { login, password });
  }

  // Envoie une requête au serveur pour terminer la session
  logout(): Observable<any> {
    return this.http.post<any>('/auth/logout', {});
  }

  // Vérifie si une session serveur existe encore (utile après refresh).
  checkSession(): Observable<User | null> {
    return this.http.get<{ success: boolean; user?: User }>('/auth/me').pipe(
      map((res) => (res.success && res.user ? res.user : null)),
      tap((user) => {
        if (user) {
          this.setUser(user);
        } else {
          this.clearUser();
        }
      }),
      catchError(() => {
        this.clearUser();
        return of(null);
      })
    );
  }

  // Stocke l'utilisateur dans l'observable (information client)
  setUser(user: User): void {
    this.user$.next(user);
  }

  // Efface l'utilisateur (déconnexion)
  clearUser(): void {
    this.user$.next(null);
  }
}
