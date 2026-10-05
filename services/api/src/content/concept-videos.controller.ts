import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { Language, PeriodConceptVideos, TopicConceptVideos } from '@kinetix/shared';
import { eq } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, DevicePrincipal, UserPrincipal } from '../auth/principal.js';
import { DbService } from '../db/db.service.js';
import { boardSessions, devices } from '../db/schema.js';
import { ConceptVideosService, LANGUAGES } from './concept-videos.service.js';

function language(lang: string | undefined): Language | undefined {
  if (!lang) return undefined;
  if (!(LANGUAGES as string[]).includes(lang)) throw new BadRequestException('lang must be en, hi or kn');
  return lang as Language;
}

/**
 * Concept videos for the apps: a topic's videos (board, Student App, Teacher App) and the board's
 * suggestion at the start of a period. Played with YouTube's embedded player; nothing is
 * downloaded or stored on the device.
 */
@Controller('v1')
export class ConceptVideosController {
  constructor(
    private readonly db: DbService,
    private readonly videos: ConceptVideosService,
  ) {}

  /** A topic's videos: `lang` first (default: the topic's course language), then English, then the rest. */
  @Get('content/topics/:id/videos')
  @Auth(['user', 'board'])
  topic(@CurrentPrincipal() p: UserPrincipal | BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('lang') lang?: string): Promise<TopicConceptVideos> {
    const preferred = language(lang);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const courseLanguage = await this.videos.topicLanguage(tx, id);
      if (!courseLanguage) throw new NotFoundException('Topic not found');
      const l = preferred ?? courseLanguage;
      return { topicId: id, language: l, videos: await this.videos.forTopics(tx, [id], l) };
    });
  }

  /**
   * The board's period (open class, else the current or next one today) with its topic's
   * videos, for the suggestion card at the start of a period and the Concept videos button.
   */
  @Get('devices/me/concept-videos')
  @Auth(['device', 'board'])
  forBoard(@CurrentPrincipal() p: DevicePrincipal | BoardPrincipal, @Query('lang') lang?: string): Promise<PeriodConceptVideos> {
    const preferred = language(lang);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select({ roomId: devices.roomId }).from(devices).where(eq(devices.id, p.deviceId));
      let slotId: string | null = null;
      if (p.kind === 'board') {
        const [s] = await tx.select({ slotId: boardSessions.timetableSlotId }).from(boardSessions).where(eq(boardSessions.id, p.sessionId));
        slotId = s?.slotId ?? null;
      }
      return this.videos.forBoard(tx, { slotId, teacherId: p.kind === 'board' ? p.teacherId : null, roomId: d?.roomId ?? null }, preferred);
    });
  }
}
