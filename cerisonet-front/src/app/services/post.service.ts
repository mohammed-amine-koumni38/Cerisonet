// Service des posts : communication avec l'API backend (Etape 4 étendu)
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AddCommentPayload,
  CommentActionResponse,
  CreatePostPayload,
  CreatePostResponse,
  EditCommentPayload,
  EditPostPayload,
  EditPostResponse,
  GetPostsResponse,
  SortOption,
  ToggleLikeResponse
} from '../models/post.model';

@Injectable({ providedIn: 'root' })
export class PostService {
  private http = inject(HttpClient);

  // Récupère les posts avec tri, filtre hashtag et pagination par curseur
  getPosts(
    limit = 10,
    cursor?: string,
    sort: SortOption = 'date_desc',
    hashtag?: string
  ): Observable<GetPostsResponse> {
    let params = new HttpParams()
      .set('limit', String(limit))
      .set('sort', sort);

    if (cursor) {
      params = params.set('cursor', cursor);
    }
    if (hashtag && hashtag.trim()) {
      params = params.set('hashtag', hashtag.trim());
    }

    return this.http.get<GetPostsResponse>('/posts/getPosts', { params });
  }

  // Crée un nouveau post
  createPost(payload: CreatePostPayload): Observable<CreatePostResponse> {
    return this.http.post<CreatePostResponse>('/posts/createPost', payload);
  }

  // Ajoute un commentaire sur un post
  addComment(postId: string, payload: AddCommentPayload): Observable<CommentActionResponse> {
    return this.http.post<CommentActionResponse>(`/posts/${postId}/comment`, payload);
  }

  // Modifie le texte d'un commentaire (vérif auteur côté serveur via session)
  editComment(postId: string, commentId: string, payload: EditCommentPayload): Observable<CommentActionResponse> {
    return this.http.put<CommentActionResponse>(`/posts/${postId}/comment/${commentId}`, payload);
  }

  // Supprime un commentaire (vérif auteur côté serveur via session)
  deleteComment(postId: string, commentId: string): Observable<CommentActionResponse> {
    return this.http.delete<CommentActionResponse>(`/posts/${postId}/comment/${commentId}`);
  }

  // Modifie un post (vérif propriétaire côté serveur)
  editPost(postId: string, payload: EditPostPayload): Observable<EditPostResponse> {
    return this.http.put<EditPostResponse>(`/posts/${postId}`, payload);
  }

  // Supprime un post (vérif propriétaire côté serveur)
  deletePost(postId: string): Observable<{ success: boolean; message?: string }> {
    return this.http.delete<{ success: boolean; message?: string }>(`/posts/${postId}`);
  }

  // Like / Unlike toggle sur un post
  toggleLike(postId: string): Observable<ToggleLikeResponse> {
    return this.http.post<ToggleLikeResponse>(`/posts/${postId}/like`, {});
  }
}


