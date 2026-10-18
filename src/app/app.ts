import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type RecordKind = 'Задача' | 'Блокер' | 'Замечание' | 'Встреча';
type Priority = 'Высокий' | 'Средний' | 'Низкий';

interface BoardTask {
  id: number;
  title: string;
  kind: RecordKind;
  priority: Priority;
  zone: string;
  due: string;
  owner: string;
  frame: string;
  longitudinal: string;
  photoUrl?: string;
}

interface TeamMember {
  id: number;
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
export class App {
  readonly todayLabel = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date()).replace(/^./, (letter) => letter.toUpperCase());

  readonly tasks = signal<BoardTask[]>([
    { id: 1, title: 'Согласовать обход кабельного лотка', kind: 'Задача', priority: 'Высокий', zone: 'Пожарная зона 5', due: 'сегодня, 10:00', owner: 'ИП', frame: '', longitudinal: '' },
    { id: 2, title: 'Закрыть замечания по подвесам', kind: 'Задача', priority: 'Средний', zone: 'Палуба 5', due: 'до 21 октября', owner: 'МС', frame: '', longitudinal: '' },
    { id: 3, title: 'Подготовить участок к изоляции', kind: 'Задача', priority: 'Высокий', zone: 'Пожарная зона 5', due: 'сегодня, 14:00', owner: 'АК', frame: '', longitudinal: '' },
    { id: 4, title: 'Обновить замеры воздуховода', kind: 'Задача', priority: 'Низкий', zone: 'Кормовая зона', due: 'до 23 октября', owner: 'ЛВ', frame: '', longitudinal: '' },
  ]);
  readonly newBlockers = signal<BoardTask[]>([]);
  readonly taskCount = computed(() => this.tasks().length);
  readonly blockerCount = signal(3);
  readonly crewCount = signal(12);
  readonly overallProgress = signal(68);
  readonly modalOpen = signal(false);
  readonly activeView = signal('Обзор');
  readonly photoLightbox = signal<string | null>(null);
  readonly team = signal<TeamMember[]>(this.loadTeam());
  readonly assignedCount = computed(() => this.team().filter((member) => this.isAssigned(member)).length);
  readonly showMemberForm = signal(false);
  readonly editingMemberId = signal<number | null>(null);

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

  readonly dueTodayCount = computed(() => this.tasks().filter((task) => task.due.startsWith('сегодня')).length);

  private emptyForm() {
    return {
      title: '', kind: 'Задача' as RecordKind, priority: 'Средний' as Priority,
      zone: 'Палуба 5 · Пожарная зона 5', due: '', owner: '', frame: '',
      side: '' as '' | 'Центр' | 'Лево' | 'Право', longitudinalNumber: '',
    };
  }

  private emptyMemberForm(): Omit<TeamMember, 'id'> {
    return { name: '', role: 'Монтажник вентиляции', deck: '', zone: '', task: '', until: '' };
  }

  private loadTeam(): TeamMember[] {
    const examples: TeamMember[] = [
      { id: 1, name: 'Иван Петров', role: 'Монтажник вентиляции', deck: 'Палуба 5', zone: 'Пожарная зона 5', task: 'Монтаж магистрали', until: '12:00' },
      { id: 2, name: 'Марк Соколов', role: 'Монтажник вентиляции', deck: 'Палуба 5', zone: 'Пожарная зона 5', task: 'Исправить подвесы', until: '15:00' },
      { id: 3, name: 'Леонид Волков', role: 'Замерщик', deck: 'Палуба 5', zone: 'Кормовая зона', task: 'Замеры воздуховода', until: '11:30' },
      { id: 4, name: 'Сергей Иванов', role: 'Монтажник вентиляции', deck: 'Палуба 4', zone: 'Пожарная зона 4', task: 'Монтаж ответвления', until: '16:00' },
      { id: 5, name: 'Артём Ковалёв', role: 'Изолировщик', deck: 'Палуба 5', zone: 'Пожарная зона 5', task: 'Подготовить участок к изоляции', until: '14:00' },
      { id: 6, name: 'Денис Орлов', role: 'Монтажник вентиляции', deck: 'Палуба 3', zone: 'Носовая зона', task: 'Монтаж воздуховода', until: '15:30' },
      { id: 7, name: 'Павел Смирнов', role: 'Монтажник вентиляции', deck: 'Палуба 5', zone: 'Пожарная зона 5', task: 'Монтаж магистрали', until: '12:00' },
      { id: 8, name: 'Никита Беляев', role: 'Монтажник вентиляции', deck: 'Палуба 4', zone: 'Пожарная зона 4', task: 'Монтаж подвесов', until: '16:00' },
      { id: 9, name: 'Олег Захаров', role: 'Изолировщик', deck: 'Палуба 5', zone: 'Кормовая зона', task: 'Изоляция участка', until: '13:30' },
      { id: 10, name: 'Виктор Макаров', role: 'Монтажник вентиляции', deck: '', zone: '', task: '', until: '' },
      { id: 11, name: 'Андрей Фёдоров', role: 'Монтажник вентиляции', deck: '', zone: '', task: '', until: '' },
      { id: 12, name: 'Михаил Павлов', role: 'Монтажник вентиляции', deck: '', zone: '', task: '', until: '' },
    ];
    try {
      const saved = localStorage.getItem('paluba-team');
      return saved ? JSON.parse(saved) as TeamMember[] : examples;
    } catch { return examples; }
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

  saveMember(): void {
    if (!this.memberForm.name.trim()) return;
    const editId = this.editingMemberId();
    if (editId) {
      this.team.update((members) => members.map((member) => member.id === editId
        ? { ...this.memberForm, id: editId, name: this.memberForm.name.trim() }
        : member));
      this.notify('Данные сотрудника обновлены');
    } else {
      const member: TeamMember = { ...this.memberForm, id: Date.now(), name: this.memberForm.name.trim() };
      this.team.update((members) => [...members, member]);
      this.notify('Сотрудник добавлен в команду');
    }
    this.persistTeam();
    this.showMemberForm.set(false);
  }

  deleteMember(id: number): void {
    this.team.update((members) => members.filter((member) => member.id !== id));
    this.persistTeam();
    this.notify('Сотрудник удалён из команды');
  }

  private persistTeam(): void {
    try { localStorage.setItem('paluba-team', JSON.stringify(this.team())); }
    catch { this.notify('Не удалось сохранить изменения на этом устройстве'); }
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

  addTask(): void {
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
    const task: BoardTask = {
      id: Date.now(),
      title: this.form.title.trim(),
      kind: this.form.kind,
      priority: this.form.priority,
      zone: [this.form.zone || 'Общий участок', this.form.frame ? `Фрейм ${this.form.frame}` : '', longitudinal]
        .filter(Boolean).join(' · '),
      due: due === 'без срока' ? due : `до ${due}`,
      owner: ownerInitials,
      frame: this.form.frame,
      longitudinal,
      photoUrl: this.selectedFile ? URL.createObjectURL(this.selectedFile) : undefined,
    };
    this.tasks.update((tasks) => [task, ...tasks]);
    if (task.kind === 'Блокер') {
      this.newBlockers.update((blockers) => [task, ...blockers]);
      this.blockerCount.update((count) => count + 1);
    }
    this.selectedFile = null;
    this.setPhotoPreview(null);
    this.modalOpen.set(false);
    this.notify(`${task.kind} добавлена`);
  }

  selectShip(ship: string): void {
    this.selectedShip = ship;
    const stats: Record<string, [number, number, number]> = {
      'Судно 724': [68, 3, 12], 'Судно 725': [42, 5, 8], 'Судно 731': [81, 1, 16],
    };
    const [progress, blockers, crew] = stats[ship];
    this.overallProgress.set(progress);
    this.blockerCount.set(blockers + this.newBlockers().length);
    this.crewCount.set(crew);
    this.notify(`${ship} выбрано`);
  }

  saveNote(): void {
    const value = this.quickNote.trim();
    if (!value) { this.notify('Введите текст заметки'); return; }
    try {
      const notes = JSON.parse(localStorage.getItem('paluba-notes') || '[]') as Array<{ text: string; at: string }>;
      notes.unshift({ text: value, at: new Date().toISOString() });
      localStorage.setItem('paluba-notes', JSON.stringify(notes));
    } catch { /* Local notes are optional in this visual prototype. */ }
    this.quickNote = '';
    this.notify('Заметка сохранена на этом устройстве');
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
