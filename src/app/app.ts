import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

type RecordKind = 'Задача' | 'Блокер' | 'Замечание' | 'Встреча';
type Priority = 'Высокий' | 'Средний' | 'Низкий';

interface BoardTask {
  id: string;
  title: string;
  kind: RecordKind;
  priority: Priority;
  zone: string;
  due: string;
  owner: string;
  frame: string;
  longitudinal: string;
  photoUrl?: string;
  photoPath?: string;
  dueDate?: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  deck: string;
  zone: string;
  task: string;
  until: string;
}

@Component({
  selector: 'shipyard-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly supabase = inject(SupabaseService);
  readonly authReady = signal(false);
  readonly session = signal<Session | null>(null);
  readonly authBusy = signal(false);
  readonly authError = signal('');
  authEmail = 'V-A-N-D';
  authPassword = '';
  readonly todayLabel = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date()).replace(/^./, (letter) => letter.toUpperCase());

  readonly tasks = signal<BoardTask[]>([]);
  readonly newBlockers = signal<BoardTask[]>([]);
  readonly taskCount = computed(() => this.tasks().length);
  readonly blockerCount = computed(() => this.tasks().filter((task) => task.kind === 'Блокер').length);
  readonly crewCount = signal(0);
  readonly overallProgress = signal(68);
  readonly modalOpen = signal(false);
  readonly activeView = signal('Обзор');
  readonly photoLightbox = signal<string | null>(null);
  readonly team = signal<TeamMember[]>([]);
  readonly assignedCount = computed(() => this.team().filter((member) => this.isAssigned(member)).length);
  readonly showMemberForm = signal(false);
  readonly editingMemberId = signal<string | null>(null);

  selectedShip = 'Судно 724';
  selectedDeck = 'Палуба 5';
  selectedZone = 'Пожарная зона 5';
  selectedFile: File | null = null;
  photoPreview: string | null = null;
  quickNote = '';
  memberSearch = '';
  teamFilter: 'Все' | 'Назначены' | 'Свободны' = 'Все';
  memberForm: Omit<TeamMember, 'id'> = this.emptyMemberForm();
  toastMessage = signal('');
  private toastTimer?: ReturnType<typeof setTimeout>;

  form: {
    title: string;
    kind: RecordKind;
    priority: Priority;
    zone: string;
    due: string;
    owner: string;
    frame: string;
    side: '' | 'Центр' | 'Лево' | 'Право';
    longitudinalNumber: string;
  } = this.emptyForm();

  readonly dueTodayCount = computed(() => this.tasks().filter((task) => task.dueDate === new Date().toISOString().slice(0, 10)).length);

  async ngOnInit(): Promise<void> {
    if (!this.supabase.client) {
      this.authError.set('Не настроено подключение к Supabase. Проверьте URL и Publishable key.');
      this.authReady.set(true);
      return;
    }
    const { data, error } = await this.supabase.client.auth.getSession();
    if (error) this.authError.set(error.message);
    this.session.set(data.session);
    this.authReady.set(true);
    if (data.session) await this.loadCloudData();
    this.supabase.client.auth.onAuthStateChange((_event, nextSession) => {
      this.session.set(nextSession);
      if (nextSession) void this.loadCloudData();
      else {
        this.tasks.set([]);
        this.team.set([]);
      }
    });
  }

  async signIn(): Promise<void> {
    this.authBusy.set(true);
    this.authError.set('');
    try {
      const { error } = await this.supabase.signIn(this.authEmail.trim(), this.authPassword);
      if (error) throw error;
      this.authPassword = '';
    } catch (error) {
      this.authError.set(error instanceof Error ? error.message : 'Не удалось войти');
    } finally {
      this.authBusy.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.signOut();
  }

  private async loadCloudData(): Promise<void> {
    try {
      const [rows, members] = await Promise.all([this.supabase.listWorkItems(this.selectedShip), this.supabase.listTeamMembers(this.selectedShip)]);
      const tasks = await Promise.all(rows.map(async (row) => {
        const longitudinal = row.longitudinal_side === 'Центр'
          ? 'L0'
          : row.longitudinal_number !== null && row.longitudinal_number !== undefined
            ? `${row.longitudinal_side} L${row.longitudinal_number}` : '';
        const due = row.due_at
          ? new Date(`${row.due_at}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
          : 'без срока';
        const photoUrl = row.photo_path ? await this.supabase.getWorkPhotoUrl(row.photo_path) : undefined;
        return {
          id: row.id,
          title: row.title,
          kind: row.record_type,
          priority: row.priority,
          zone: [row.deck, row.zone, row.frame_number ? `Фрейм ${row.frame_number}` : '', longitudinal].filter(Boolean).join(' · '),
          due: due === 'без срока' ? due : `до ${due}`,
          owner: row.assigned_to ? this.initials(row.assigned_to) : 'АК',
          frame: row.frame_number ?? '',
          longitudinal,
          photoPath: row.photo_path ?? undefined,
          photoUrl,
          dueDate: row.due_at ?? undefined,
        } as BoardTask;
      }));
      this.tasks.set(tasks);
      this.team.set(members.map((member) => ({
        id: member.id,
        name: member.name,
        role: member.role,
        deck: member.deck,
        zone: member.zone,
        task: member.current_task,
        until: member.available_at?.slice(0, 5) ?? '',
      })));
      this.crewCount.set(members.length);
    } catch (error) {
      this.notify(`Ошибка загрузки из Supabase: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    }
  }

  private emptyForm() {
    return {
      title: '', kind: 'Задача' as RecordKind, priority: 'Средний' as Priority,
      zone: this.selectedZone, due: '', owner: '', frame: '',
      side: '' as '' | 'Центр' | 'Лево' | 'Право', longitudinalNumber: '',
    };
  }

  private emptyMemberForm(): Omit<TeamMember, 'id'> {
    return { name: '', role: 'Монтажник вентиляции', deck: '', zone: '', task: '', until: '' };
  }

  get visibleTeam(): TeamMember[] {
    const search = this.memberSearch.trim().toLocaleLowerCase('ru');
    return this.team().filter((member) => {
      const matchesSearch = !search || `${member.name} ${member.role} ${member.deck} ${member.zone} ${member.task}`.toLocaleLowerCase('ru').includes(search);
      const assigned = this.isAssigned(member);
      const matchesFilter = this.teamFilter === 'Все' || (this.teamFilter === 'Назначены' ? assigned : !assigned);
      return matchesSearch && matchesFilter;
    });
  }

  isAssigned(member: TeamMember): boolean {
    return Boolean(member.deck.trim() || member.zone.trim() || member.task.trim());
  }

  memberLocation(member: TeamMember): string {
    return [member.deck, member.zone].filter(Boolean).join(' · ');
  }

  openMemberForm(member?: TeamMember): void {
    if (member) {
      this.editingMemberId.set(member.id);
      this.memberForm = { name: member.name, role: member.role, deck: member.deck, zone: member.zone, task: member.task, until: member.until };
    } else {
      this.editingMemberId.set(null);
      this.memberForm = this.emptyMemberForm();
    }
    this.showMemberForm.set(true);
  }

  async saveMember(): Promise<void> {
    if (!this.memberForm.name.trim()) return;
    const editId = this.editingMemberId();
    try {
    const saved = await this.supabase.upsertTeamMember({
      name: this.memberForm.name.trim(), role: this.memberForm.role,
      vessel: this.selectedShip, deck: this.memberForm.deck, zone: this.memberForm.zone,
      current_task: this.memberForm.task, available_at: this.memberForm.until || null,
    }, editId ?? undefined);
    const member: TeamMember = { ...this.memberForm, id: saved.id, name: saved.name };
    if (editId) {
      this.team.update((members) => members.map((current) => current.id === editId ? member : current));
      this.notify('Данные сотрудника обновлены');
    } else {
      this.team.update((members) => [...members, member]);
      this.notify('Сотрудник добавлен в команду');
    }
    this.showMemberForm.set(false);
    } catch (error) {
      this.notify(`Не удалось сохранить сотрудника: ${error instanceof Error ? error.message : 'ошибка'}`);
    }
  }

  async deleteMember(id: string): Promise<void> {
    try { await this.supabase.deleteTeamMember(id); }
    catch (error) { this.notify(`Не удалось удалить: ${error instanceof Error ? error.message : 'ошибка'}`); return; }
    this.team.update((members) => members.filter((member) => member.id !== id));
    this.notify('Сотрудник удалён из команды');
  }

  openModal(): void {
    this.form = this.emptyForm();
    this.selectedFile = null;
    this.setPhotoPreview(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.selectedFile = null;
    this.setPhotoPreview(null);
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      input.value = '';
      this.notify('Выберите файл изображения');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      input.value = '';
      this.notify('Фото должно быть меньше 8 МБ');
      return;
    }
    this.selectedFile = file;
    this.setPhotoPreview(URL.createObjectURL(file));
  }

  private setPhotoPreview(url: string | null): void {
    if (this.photoPreview?.startsWith('blob:')) URL.revokeObjectURL(this.photoPreview);
    this.photoPreview = url;
  }

  async addTask(): Promise<void> {
    if (!this.form.title.trim()) return;
    if (this.form.kind === 'Блокер' && !this.selectedFile) {
      this.notify('Для блокера обязательно прикрепить фото');
      return;
    }
    if ((this.form.side === 'Лево' || this.form.side === 'Право') && !this.form.longitudinalNumber) {
      this.notify('Укажите номер L-шпангоута');
      return;
    }
    if (this.form.longitudinalNumber && !this.form.side) {
      this.notify('Укажите сторону L-шпангоута');
      return;
    }

    const due = this.form.due
      ? new Date(`${this.form.due}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
      : 'без срока';
    const longitudinal = this.form.side === 'Центр'
      ? 'L0'
      : this.form.longitudinalNumber ? `${this.form.side} L${this.form.longitudinalNumber}` : '';
    const ownerInitials = this.form.owner.trim()
      ? this.form.owner.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
      : 'АК';
    try {
    const user = this.session()?.user;
    if (!user) throw new Error('Сначала войдите в приложение');
    const photoPath = this.selectedFile ? await this.supabase.uploadWorkPhoto(this.selectedFile, user.id) : null;
    const row = await this.supabase.insertWorkItem({
      vessel: this.selectedShip,
      title: this.form.title.trim(),
      record_type: this.form.kind,
      priority: this.form.priority,
      deck: this.selectedDeck,
      zone: this.form.zone || this.selectedZone || 'Общий участок',
      frame_number: this.form.frame,
      longitudinal_side: this.form.side,
      longitudinal_number: this.form.longitudinalNumber ? Number(this.form.longitudinalNumber) : null,
      due_at: this.form.due || null,
      assigned_to: this.form.owner.trim(),
      photo_path: photoPath,
    });
    const task: BoardTask = {
      id: row.id, title: row.title, kind: row.record_type, priority: row.priority,
      zone: [row.deck, row.zone, row.frame_number ? `Фрейм ${row.frame_number}` : '', longitudinal].filter(Boolean).join(' · '),
      due: due === 'без срока' ? due : `до ${due}`, owner: ownerInitials,
      frame: row.frame_number, longitudinal, photoPath: photoPath ?? undefined,
      photoUrl: photoPath ? await this.supabase.getWorkPhotoUrl(photoPath) : undefined,
      dueDate: row.due_at ?? undefined,
    };
    this.tasks.update((tasks) => [task, ...tasks]);
    if (task.kind === 'Блокер') {
      this.newBlockers.update((blockers) => [task, ...blockers]);
    }
    this.selectedFile = null;
    this.setPhotoPreview(null);
    this.modalOpen.set(false);
    this.notify(`${task.kind} добавлена`);
    } catch (error) {
      this.notify(`Не удалось сохранить запись: ${error instanceof Error ? error.message : 'ошибка'}`);
    }
  }

  selectShip(ship: string): void {
    this.selectedShip = ship;
    const stats: Record<string, [number, number, number]> = {
      'Судно 724': [68, 3, 12], 'Судно 725': [42, 5, 8], 'Судно 731': [81, 1, 16],
    };
    const [progress, blockers, crew] = stats[ship];
    this.overallProgress.set(progress);
    void blockers;
    this.crewCount.set(crew);
    void this.loadCloudData();
    this.notify(`${ship} выбрано`);
  }

  async saveNote(): Promise<void> {
    const value = this.quickNote.trim();
    if (!value) { this.notify('Введите текст заметки'); return; }
    try {
      await this.supabase.insertNote({ vessel: this.selectedShip, deck: this.selectedDeck, zone: this.selectedZone, body: value });
      this.quickNote = '';
      this.notify('Заметка сохранена в Supabase');
    } catch (error) {
      this.notify(`Не удалось сохранить заметку: ${error instanceof Error ? error.message : 'ошибка'}`);
    }
  }

  showView(view: string): void {
    this.activeView.set(view);
    if (view !== 'Обзор' && view !== 'Команда') this.notify(`Раздел «${view}» — следующий экран прототипа`);
  }

  setTeamFilter(filter: string): void {
    this.teamFilter = filter as 'Все' | 'Назначены' | 'Свободны';
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }

  notify(message: string): void {
    this.toastMessage.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMessage.set(''), 2600);
  }
}
