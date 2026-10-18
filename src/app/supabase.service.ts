import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly configured = Boolean(environment.supabaseUrl && environment.supabasePublishableKey);
  readonly client: SupabaseClient | null = this.configured
    ? createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

  async signIn(identity: string, password: string) {
    if (!this.client) throw new Error('Supabase is not configured');
    const email = identity.trim().toLocaleLowerCase() === environment.supervisorUsername.toLocaleLowerCase()
      ? environment.supervisorEmail
      : identity.trim();
    return this.client.auth.signInWithPassword({ email, password });
  }

  async signOut() {
    if (!this.client) return;
    return this.client.auth.signOut();
  }

  async uploadWorkPhoto(file: File, userId: string): Promise<string> {
    if (!this.client) throw new Error('Supabase is not configured');
    const filePath = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await this.client.storage.from('work-item-photos').upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;
    return filePath;
  }

  async getWorkPhotoUrl(filePath: string): Promise<string> {
    if (!this.client) throw new Error('Supabase is not configured');
    const { data, error } = await this.client.storage.from('work-item-photos').createSignedUrl(filePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async listWorkItems(vessel: string) {
    if (!this.client) throw new Error('Supabase is not configured');
    const { data, error } = await this.client.from('work_items').select('*').eq('vessel', vessel).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async insertWorkItem(record: Record<string, unknown>) {
    if (!this.client) throw new Error('Supabase is not configured');
    const { data, error } = await this.client.from('work_items').insert(record).select().single();
    if (error) throw error;
    return data;
  }

  async listTeamMembers(vessel: string) {
    if (!this.client) throw new Error('Supabase is not configured');
    const { data, error } = await this.client.from('team_members').select('*').eq('is_active', true).eq('vessel', vessel).order('name');
    if (error) throw error;
    return data;
  }

  async upsertTeamMember(record: Record<string, unknown>, id?: string) {
    if (!this.client) throw new Error('Supabase is not configured');
    const query = id
      ? this.client.from('team_members').update(record).eq('id', id)
      : this.client.from('team_members').insert(record);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data;
  }

  async deleteTeamMember(id: string) {
    if (!this.client) throw new Error('Supabase is not configured');
    const { error } = await this.client.from('team_members').delete().eq('id', id);
    if (error) throw error;
  }

  async insertNote(record: Record<string, unknown>) {
    if (!this.client) throw new Error('Supabase is not configured');
    const { error } = await this.client.from('work_notes').insert(record);
    if (error) throw error;
  }
}
