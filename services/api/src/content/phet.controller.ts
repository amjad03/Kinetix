import { BadRequestException, Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ENV, type Env } from '../config/env.js';

export const PHET_ORIGIN = 'https://phet.colorado.edu/sims/html';
export const PHET_ATTRIBUTION = 'PhET Interactive Simulations, University of Colorado Boulder, CC BY 4.0';

const SIM_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LOCALE = /^[a-z]{2,3}(_[A-Z]{2})?$/;

export interface PhetSimLink {
  id: string;
  locale: string;
  url: string;
  /** False when PHET_MIRROR_URL is unset and the link goes to phet.colorado.edu. */
  mirror: boolean;
  attribution: string;
}

/** Where a sim's all-locales file is: our mirror in India, else PhET itself. */
export function phetSimUrl(mirror: string | undefined, id: string, locale: string): string {
  const base = mirror ? `${mirror.replace(/\/+$/, '')}/${id}` : `${PHET_ORIGIN}/${id}/latest`;
  return `${base}/${id}_all.html?locale=${locale}`;
}

/**
 * PhET Interactive Simulations for the board (docs/operations/phet.md). The board downloads a
 * sim once and opens it offline afterwards; this tells it where to download from. Public: the
 * sims are openly licensed (CC BY 4.0) and nothing about the caller is involved.
 */
@Controller('v1/content/sims/phet')
export class PhetController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Redirects (302) to the sim's file; `?format=json` answers with the link instead. */
  @Get(':id')
  sim(@Param('id') id: string, @Query('locale') locale: string | undefined, @Query('format') format: string | undefined, @Res() res: Response) {
    if (id.length > 80 || !SIM_ID.test(id)) throw new BadRequestException('Unknown sim id');
    const l = locale ?? 'en';
    if (!LOCALE.test(l)) throw new BadRequestException('locale must look like en, hi or pt_BR');
    const link: PhetSimLink = { id, locale: l, url: phetSimUrl(this.env.PHET_MIRROR_URL, id, l), mirror: !!this.env.PHET_MIRROR_URL, attribution: PHET_ATTRIBUTION };
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (format === 'json') return res.json(link);
    return res.redirect(302, link.url);
  }
}
