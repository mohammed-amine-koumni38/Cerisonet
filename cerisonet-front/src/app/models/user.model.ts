// Modèle de données pour l'utilisateur
// Représente un utilisateur connecté avec ses informations de base
export interface User {
  id?: number;        // Identifiant utilisateur (présent selon l'API)
  email: string;      // Adresse email de l'utilisateur
  nom: string;        // Nom complet de l'utilisateur
  prenom?: string;    // Prénom éventuel (posts/commentaires)
  pseudo?: string;    // Pseudo éventuel (posts/commentaires)
  loginAt?: string;   // Date et heure de la dernière connexion (optionnel)
}
