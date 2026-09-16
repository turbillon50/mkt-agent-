/**
 * Adaptadores de OPERACIÓN: Google Calendar, Gmail y Slack.
 *
 * Es el día a día del vendedor: agendar la cita, escribir al lead desde el
 * correo del cliente y avisarle al equipo cuando algo necesita mano humana.
 */
import type { Project } from '../db/schema';
import { run, verifyChannel, type ChannelAdapter } from './base';

export const googlecalendar: ChannelAdapter = {
  toolkit: 'googlecalendar',
  verify: (project) => verifyChannel(project, 'googlecalendar'),

  /**
   * Agenda una cita. `start_datetime` es lo único obligatorio de la tool; la
   * duración va en horas y minutos por separado, no en fecha de fin.
   */
  async createEvent(project: Project, input: Record<string, unknown>) {
    const inicio = String(input.start ?? input.start_datetime ?? '');
    if (!inicio) throw new Error('Falta la hora de la cita.');
    return run(project, 'googlecalendar', 'GOOGLECALENDAR_CREATE_EVENT', {
      start_datetime: inicio,
      summary: String(input.titulo ?? input.summary ?? 'Cita'),
      ...(input.descripcion ? { description: String(input.descripcion) } : {}),
      ...(input.ubicacion ? { location: String(input.ubicacion) } : {}),
      ...(input.zona ? { timezone: String(input.zona) } : {}),
      ...(Array.isArray(input.invitados) ? { attendees: input.invitados } : {}),
      event_duration_hour: Number(input.horas ?? 1),
      event_duration_minutes: Number(input.minutos ?? 0),
    });
  },

  /** Los huecos libres, para ofrecer horarios que de verdad existen. */
  async readRows(project: Project, input: Record<string, unknown> = {}) {
    return run(project, 'googlecalendar', 'GOOGLECALENDAR_FIND_FREE_SLOTS', {
      ...(input.desde ? { time_min: String(input.desde) } : {}),
      ...(input.hasta ? { time_max: String(input.hasta) } : {}),
    });
  },
};

export const gmail: ChannelAdapter = {
  toolkit: 'gmail',
  verify: (project) => verifyChannel(project, 'gmail'),

  async sendEmail(
    project: Project,
    input: { to: string; subject: string; body: string; html?: boolean },
  ) {
    return run(project, 'gmail', 'GMAIL_SEND_EMAIL', {
      recipient_email: input.to,
      subject: input.subject,
      body: input.body,
      is_html: Boolean(input.html),
    });
  },

  /** Lo que llegó al correo del cliente: sirve para enganchar respuestas de leads. */
  async readRows(project: Project, input: Record<string, unknown> = {}) {
    return run(project, 'gmail', 'GMAIL_FETCH_EMAILS', {
      max_results: Math.min(Math.max(Number(input.limite ?? 10), 1), 25),
      ...(input.query ? { query: String(input.query) } : {}),
    });
  },
};

export const slack: ChannelAdapter = {
  toolkit: 'slack',
  verify: (project) => verifyChannel(project, 'slack'),

  /**
   * Avisa al equipo. El canal va como viene: Slack acepta tanto `#ventas` como
   * el id `C0123…`, y normalizarlo por nuestra cuenta solo agregaría una forma
   * más de equivocarse.
   */
  async notify(project: Project, input: { canal: string; texto: string }) {
    return run(project, 'slack', 'SLACK_SEND_MESSAGE', {
      channel: input.canal,
      text: input.texto,
      markdown_text: input.texto,
    });
  },
};
