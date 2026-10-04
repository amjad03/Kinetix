import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** Validates a request body against a zod schema: `@Body(new ZodBody(Schema)) body: z.infer<typeof Schema>`. */
export class ZodBody<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(z.flattenError(parsed.error));
    return parsed.data;
  }
}
