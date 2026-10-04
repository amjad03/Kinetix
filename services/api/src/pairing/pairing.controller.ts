import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { PairingService } from './pairing.service.js';

const ClaimBody = z
  .object({ code: z.string().max(12).optional(), qr: z.string().max(512).optional() })
  .refine((b) => b.code || b.qr, 'Provide the code or the scanned QR');

@Controller('v1/pairing')
export class PairingController {
  constructor(private readonly pairing: PairingService) {}

  /** Teacher App: "Connect to board" after scanning the QR or typing the code. */
  @Post('claim')
  @HttpCode(200)
  @Auth('user', TEACHING_ROLES)
  claim(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ClaimBody)) body: z.infer<typeof ClaimBody>) {
    return this.pairing.claim(p, body);
  }
}
