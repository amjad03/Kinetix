import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { and, asc, eq, gte, lte, ne } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, DevicePrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import { DbService } from '../db/db.service.js';
import { devices, examPapers, examSeats, examSessions, rooms, students, subjects } from '../db/schema.js';

type Lang = 'en' | 'hi' | 'kn';

/** Hall rules shown on the board of an exam room (read-only). */
export const HALL_INSTRUCTIONS: Record<Lang, string[]> = {
  en: ['Take only your own seat, shown on this board.', 'Keep your hall ticket and ID card on the desk.', 'Mobile phones, smart watches and notes are not allowed in the hall.', 'Do not write anything on the question paper except your register number.', 'Raise your hand and wait for the invigilator if you need anything.', 'Leave the hall only after the answer script has been collected.'],
  hi: ['केवल अपनी सीट पर बैठें, जो इस बोर्ड पर दिखाई गई है।', 'हॉल टिकट और पहचान पत्र मेज़ पर रखें।', 'हॉल में मोबाइल फ़ोन, स्मार्ट घड़ी और नोट्स की अनुमति नहीं है।', 'प्रश्न पत्र पर रजिस्टर नंबर के अलावा कुछ न लिखें।', 'कोई ज़रूरत हो तो हाथ उठाएँ और निरीक्षक की प्रतीक्षा करें।', 'उत्तर पुस्तिका जमा होने के बाद ही हॉल से बाहर जाएँ।'],
  kn: ['ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ತೋರಿಸಿರುವ ನಿಮ್ಮ ಸ್ವಂತ ಆಸನದಲ್ಲಿ ಮಾತ್ರ ಕುಳಿತುಕೊಳ್ಳಿ.', 'ಹಾಲ್ ಟಿಕೆಟ್ ಮತ್ತು ಗುರುತಿನ ಚೀಟಿಯನ್ನು ಮೇಜಿನ ಮೇಲೆ ಇಡಿ.', 'ಹಾಲ್‌ನಲ್ಲಿ ಮೊಬೈಲ್ ಫೋನ್, ಸ್ಮಾರ್ಟ್ ವಾಚ್ ಮತ್ತು ಟಿಪ್ಪಣಿಗಳಿಗೆ ಅವಕಾಶವಿಲ್ಲ.', 'ಪ್ರಶ್ನೆ ಪತ್ರಿಕೆಯ ಮೇಲೆ ನೋಂದಣಿ ಸಂಖ್ಯೆಯನ್ನು ಬಿಟ್ಟು ಬೇರೇನೂ ಬರೆಯಬೇಡಿ.', 'ಏನಾದರೂ ಬೇಕಿದ್ದರೆ ಕೈ ಎತ್ತಿ ಮೇಲ್ವಿಚಾರಕರಿಗಾಗಿ ಕಾಯಿರಿ.', 'ಉತ್ತರ ಪತ್ರಿಕೆ ಸಂಗ್ರಹವಾದ ನಂತರವೇ ಹಾಲ್‌ನಿಂದ ಹೊರಹೋಗಿ.'],
};

const DAYS_AHEAD = 14;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * What an exam room's smartboard shows, read-only: today's sittings with the seat plan (register numbers and seat
 * numbers only, no names), the room's exam timetable for the next two weeks, and the hall instructions.
 */
@Controller('v1/devices')
export class ExamBoardController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  @Get('me/exam-room')
  @Auth(['device', 'board'])
  examRoom(@CurrentPrincipal() p: DevicePrincipal | BoardPrincipal, @Query('date') dateQ?: string, @Query('lang') langQ?: string) {
    const lang: Lang = langQ === 'hi' || langQ === 'kn' ? langQ : 'en';
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dev] = await tx.select({ roomId: devices.roomId }).from(devices).where(eq(devices.id, p.deviceId));
      if (!dev?.roomId) throw new NotFoundException('This board is not placed in a room');
      const [room] = await tx.select({ id: rooms.id, name: rooms.name }).from(rooms).where(eq(rooms.id, dev.roomId));
      const today = await tenantToday(tx, this.clock);
      const date = dateQ && /^\d{4}-\d{2}-\d{2}$/.test(dateQ) ? dateQ : today;
      const seats = await tx
        .select({ paperId: examPapers.id, date: examPapers.examDate, startsAt: examPapers.startsAt, endsAt: examPapers.endsAt, subject: subjects.name, session: examSessions.name, seatNo: examSeats.seatNo, rollNo: students.rollNo })
        .from(examSeats)
        .innerJoin(examPapers, eq(examPapers.id, examSeats.paperId))
        .innerJoin(examSessions, eq(examSessions.id, examPapers.sessionId))
        .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
        .innerJoin(students, eq(students.id, examSeats.studentId))
        .where(and(eq(examSeats.roomId, dev.roomId), gte(examPapers.examDate, date), lte(examPapers.examDate, addDays(date, DAYS_AHEAD)), ne(examSessions.status, 'draft')))
        .orderBy(asc(examPapers.examDate), asc(examPapers.startsAt), asc(examSeats.seatNo));
      const byPaper = new Map<string, { paperId: string; date: string; startsAt: string; endsAt: string; subject: string; session: string; seats: { seatNo: number; rollNo: string }[] }>();
      for (const s of seats) {
        const e = byPaper.get(s.paperId) ?? byPaper.set(s.paperId, { paperId: s.paperId, date: s.date, startsAt: s.startsAt.slice(0, 5), endsAt: s.endsAt.slice(0, 5), subject: s.subject, session: s.session, seats: [] }).get(s.paperId)!;
        e.seats.push({ seatNo: s.seatNo, rollNo: s.rollNo });
      }
      const all = [...byPaper.values()];
      return {
        room: room!,
        date,
        lang,
        sittings: all.filter((x) => x.date === date),
        timetable: all.map(({ paperId, date: d, startsAt, endsAt, subject, session, seats: st }) => ({ paperId, date: d, startsAt, endsAt, subject, session, candidates: st.length })),
        instructions: HALL_INSTRUCTIONS[lang],
      };
    });
  }
}
